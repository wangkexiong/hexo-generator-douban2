var request = require('request');
var Promise = require('bluebird');
var Q = require('q');
var log = require('log4node');

hexo_douban_debug = process.env.NODE_DEBUG && /\bhexo-generator-douban2\b/.test(process.env.NODE_DEBUG)
if (!hexo_douban_debug) {
    log.setLogLevel('emergency');
}

var Chain = function () {
    this.monitor = 10000;
    this.req = null;
    this.msg = '';

    this.seq = 0;
    this.next = null;
    this.deferred = Q.defer();
};

Chain.prototype = {
    execute: function () {
        if (this.seq === 0 && this.next === null) {
            var data = 'No actions to run...';
            this.deferred.reject(data);
        }

        if (this.next !== null) {
            this.next(this);
        } else {
            this.deferred.resolve(this.msg);
        }

        return this.deferred.promise;
    }
};

var douban_comments = function (context) {
    var timer = setTimeout(function () {
        log.info('Timeout ....');
        timer = null;
        context.next = null;
        context.execute()
    }, context.monitor);

    request(context.req, function (error, response, body) {
        if (error) {
            log.error(error);
            context.msg = '';
            context.next = null;
            context.execute();
        } else {
            log.info(response.request.href + ' OK...');
            var total = body.total;
            var count = body.count;
            var collections = body.collections;

            for (var collection of collections) {
                if (collection) {
                    if (!collection.comment) {
                        collection.comment = "没有评论"
                    }
                    context.msg += "<article class=\"leisure\">" +
                        "<aside><img src=" + collection.book.images.large + " alt=" + collection.book.title + "></aside>" +
                        "<section class=\"intro\"><ul>" +
                        "<li><a class href=" + collection.book.alt + ">" + collection.book.title + "</a></li>" +
                        "<li>" + collection.updated + "</li>" +
                        "<li>" + collection.comment + "</li>" +
                        "</ul></section>" +
                        "</article><hr>"
                }
            }

            if (timer) {
                clearTimeout(timer);

                round = Math.floor(total / count);
                if (total % count === 0) {
                    round -= 1;
                }
                if (context.seq < round) {
                    context.req['qs'] = {
                        start: (context.seq + 1) * count,
                        count: count
                    };
                    context.next = douban_comments;
                } else {
                    context.next = null;
                }

                context.seq += 1;
                context.execute();
            }
        }
    });
}

module.exports = function (locals) {
    var config = this.config;
    var contents = '';
    var start = 0;
    var total = 20;
    var count = 20;

    var context = new Chain();
    if (config.douban.timeout) {
        context.monitor = config.douban.timeout;
    }

    enable_comment = config.douban.enable_comment || false;
    if (config.douban.user) {
        context.req = {
            url: 'https://api.douban.com/v2/book/user/' + config.douban.user + '/collections',
            json: true,
            qs: {
                start: 0,
                count: 20
            }
        }
        context.msg = "<style>.leisure{width:100%!important;min-height:130px!important;margin:20px 0!important;display:block!important;clear:both!important}.leisure img{width:128px!important;height:182px!important;float:left!important;background-color:#fff!important;padding:5px!important;border-radius:5px!important;border:1px solid #dedede!important;margin:-5px 10px 5px 0!important}.leisure .intro{margin:5px 10px 5px 0!important; width:100%!important}.leisure .intro ul{list-style:none!important;margin-left:0!important;min-height:188px!important}.leisure .intro ul li{list-style:none!important;line-height:20px!important;margin:10px 0!important}.leisure .intro ul li:first-child{font-size:20px!important;padding-bottom:5px!important;margin-bottom:10px!important;border-bottom:1px #eee solid!important}.leisure .intro ul li:first-child a{border-bottom:none!important}.leisure .intro ul li:before{content:none!important}</style>";
        context.next = douban_comments;

        return new Promise(function (resolve, reject) {
            context.execute().then(
                function (data) {
                    resolve({
                        path: 'douban/index.html',
                        data: {title: '读书', date: new Date(), content: data, comments: enable_comment, slug: 'douban'},
                        layout: 'post'
                    });
                },
                function (error) {
                    reject(error);
                }
            );
        });
    } else {
        return {
            path: 'douban/index.html',
            data: {title: '读书', date: new Date(), content: '', comments: enable_comment, slug: 'douban'},
            layout: 'post'
        };
    }
};

