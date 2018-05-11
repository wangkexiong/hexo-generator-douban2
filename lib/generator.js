'use strict';

var request = require('request');
var Promise = require('bluebird');
var Q = require('q');
var pagination = require('hexo-pagination');
var util = require('./util');

var log = null;

var Chain = function () {
    this.monitor = 10000;
    this.req = null;

    this.style = "<style>.leisure{width:100%!important;min-height:130px!important;margin:20px 0!important;display:block!important;clear:both!important}.leisure img{width:128px!important;height:182px!important;float:left!important;background-color:#fff!important;padding:5px!important;border-radius:5px!important;border:1px solid #dedede!important;margin:-5px 10px 5px 0!important}.leisure .intro{margin:5px 10px 5px 0!important; width:100%!important}.leisure .intro ul{list-style:none!important;margin-left:0!important;min-height:188px!important}.leisure .intro ul li{list-style:none!important;line-height:20px!important;margin:10px 0!important;padding-left:100px!important;}.leisure .intro ul li:first-child{font-size:20px!important;padding-bottom:5px!important;margin-bottom:10px!important;border-bottom:1px #eee solid!important}.leisure .intro ul li:first-child a{border-bottom:none!important}.leisure .intro ul li:before{content:none!important}</style>";
    this.books = new Array();

    this.seq = 0;
    this.next = null;
    this.parallel_goodness = true;
    this.deferred = Q.defer();
};

Chain.prototype = {
    execute: function () {
        if (this.seq === 0 && this.next === null) {
            this.books = new Array();
            this.deferred.resolve(this.books);
        }

        if (this.next !== null) {
            this.next(this);
        } else {
            this.deferred.resolve(this.books);
        }

        return this.deferred.promise;
    }
};

var sequential_fetch = function (context) {
    var timer = setTimeout(function () {
        log.error('Douban API request failed....');
        timer = null;
        context.books = new Array();
        context.next = null;
        context.execute()
    }, context.monitor);

    request(context.req, function (error, response, body) {
        if (error) {
            log.error(error.message);
        } else {
            log.info(response.request.href);
            if (response.statusCode !== 200) {
                log.error(JSON.stringify(body));

                if (timer) {
                    clearTimeout(timer);

                    context.next = null;
                    context.execute();
                }
            } else {
                var total = body.total;
                var count = body.count;

                context.books = context.books.concat(body.collections);

                if (timer) {
                    clearTimeout(timer);

                    var round = Math.floor(total / count);
                    if (total % count === 0) {
                        round--;
                    }
                    if (context.seq < round) {
                        context.req['qs'] = {
                            start: (context.seq + 1) * count,
                            count: count
                        };
                        context.next = sequential_fetch;
                    } else {
                        context.next = null;
                    }

                    context.seq++;
                    context.execute();
                }
            }
        }
    });
}

var parallel_fetch = function (context) {
    context.req['timeout'] = context.monitor;

    var books = {};
    request(context.req, function (error, response, body) {
        if (error) {
            log.error(error.message);
            context.next = null;
            context.execute();
        } else {
            log.info(response.request.href);
            if (response.statusCode !== 200) {
                log.error(JSON.stringify(body));
                context.next = null;
                context.execute();
            } else {
                context.seq++;
                var total = body.total;
                var count = body.count;
                books[0] = body.collections;

                if (count >= total) {
                    context.books = books[0];
                    context.next = null;
                    context.execute();
                } else {
                    var good = 0;
                    var failed = 0;

                    var seq = [];
                    var start = count;
                    while (start < total) {
                        seq = seq.concat(start);
                        start += count;
                    }
                    for (var i = 0; i < seq.length; i++) {
                        context.req['qs'] = {
                            start: seq[i],
                            count: count,
                        };

                        request(context.req, function (error, response, body) {
                            if (error) {
                                log.error(error.message)
                                failed++;
                                context.parallel_goodness = false;
                                context.books = new Array();
                                context.next = null;
                                context.execute();
                            } else {
                                log.info(response.request.href);
                                if (response.statusCode !== 200) {
                                    log.error(JSON.stringify(body));
                                    failed++;
                                    context.parallel_goodness = false;
                                    context.books = new Array();
                                    context.next = null;
                                    context.execute();
                                } else {
                                    if (context.parallel_goodness) {
                                        books[Math.floor(body.start / body.count)] = body.collections;
                                        good++;

                                        if (good === seq.length) {
                                            for (var i in books) {
                                                context.books = context.books.concat(books[i]);
                                            }
                                            context.next = null;
                                            context.execute();
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
    });
};

module.exports = function (locals) {
    log = this.log;

    var config = this.config;
    var douban_path = config.douban.path || 'douban/';
    var douban_title = config.douban.title || 'Douban Books';
    var douban_default_comment = config.douban.default_comment || "Books are the ladder of human progress";

    var paginationDir = config.pagination_dir || 'page';
    var per_page = config.douban.per_page || 10;
    var layout = config.douban.layout || 'index';
    var enable_comment = config.douban.enable_comment || false;
    var requests_method = config.douban.requests_method || 'sequential';
    var books_per_request = config.douban.books_per_request || 50;
    var request_timeout = config.douban.request_timeout || 10000;

    if (douban_path[douban_path.length - 1] !== '/') {
        douban_path += '/';
    }
    if (!util.is_positive_integer(per_page)) {
        per_page = 10;
    }
    if (!util.is_positive_integer(books_per_request)) {
        books_per_request = 50;
    }
    if (util.is_positive_integer(books_per_request) && books_per_request > 100) {
        books_per_request = 50;
    }
    if (!util.is_positive_integer(request_timeout)) {
        request_timeout = 10000;
    }
    if (layout !== 'post' && layout !== 'index') {
        layout = 'index';
    }
    if (requests_method !== 'sequential' && requests_method !== 'parallel') {
        requests_method = 'sequential';
    }
    if (enable_comment !== true) {
        enable_comment = false;
    }

    var context = new Chain();
    context.monitor = request_timeout;

    if (config.douban.user) {
        if (layout === 'post') {
            per_page = 9999999
        }

        context.req = {
            url: 'https://api.douban.com/v2/book/user/' + config.douban.user + '/collections',
            json: true,
            qs: {
                start: 0,
                count: books_per_request,
            }
        }
        if (requests_method === 'sequential') {
            context.next = sequential_fetch;
        } else {
            context.next = parallel_fetch;
        }

        return new Promise(function (resolve, reject) {
            context.execute().then(
                function (books) {
                    var books_total = books.length;
                    var collection = null;
                    var data = context.style;
                    var posts = [];
                    var publish_date = new Date();
                    var publish_count = 0;

                    for (var i = 0; i < books_total; i++) {
                        collection = books[i];
                        if (collection) {
                            if (!collection.comment) {
                                if (!collection.book.summary) {
                                    collection.comment = douban_default_comment
                                } else {
                                    collection.comment = collection.book.summary
                                }
                            }

                            data += "<article class=\"leisure\">" +
                                "<aside><img src=" + collection.book.images.large + " alt=" + collection.book.title + "></aside>" +
                                "<section class=\"intro\"><ul>" +
                                "<li><a class href=" + collection.book.alt + ">" + collection.book.title + "</a></li>" +
                                "<li>" + collection.updated + "</li>" +
                                "<li>" + collection.comment + "</li>" +
                                "</ul></section>" +
                                "</article><hr>"

                            publish_count += 1;
                        }

                        if ((i === (books_total - 1)) || (publish_count === per_page)) {
                            posts.push({
                                title: douban_title,
                                date: publish_date,
                                content: data,
                                comments: enable_comment,
                            });

                            data = context.style;
                            publish_count = 0;
                            enable_comment = false;
                        }
                    }

                    if (books_total === 0) {
                        resolve({
                            path: douban_path,
                            data: {title: douban_title, date: new Date(), content: '', comments: enable_comment},
                            layout: 'post',
                        });
                    } else {
                        if (layout === 'post') {
                            resolve({
                                path: douban_path,
                                data: posts[0],
                                layout: 'post',
                            })
                        } else {
                            resolve(
                                pagination(douban_path, posts, {
                                    perPage: 1,
                                    layout: layout,
                                    format: paginationDir + '/%d/',
                                    data: {
                                        __index: true
                                    }
                                })
                            );
                        }
                    }
                },
                function (error) {
                    reject(error);
                }
            );
        });
    } else {
        return {
            path: douban_path,
            data: {title: douban_title, date: new Date(), content: '', comments: enable_comment},
            layout: 'post',
        };
    }
};
