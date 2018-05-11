# hexo-generator-douban2

Douban page generator plugin for Hexo.

This is a fork from [hexo-generator-douban][], which use sync-request to get information from [douban][] site.
However, when I use travis-ci to publish my blog, this hexo plugin always returns ETIMEOUT, which breaks my blog publish automation.
And because my laptop is behind cooperation proxy, above plugin does not support http proxy well.

[hexo-generator-douban]: https://github.com/Yikun/hexo-generator-douban.git
[douban]: https://www.douban.com

That's the reason why hexo-generator-douban2 is introduced...

## Install

``` bash
$ npm install hexo-generator-douban2 --save
```

## Options

You can configure this plugin in `_config.yml`.

``` yaml
douban:
    user: douban_id
```

- **user** - Your douban user id.
- **requests_method** - sequential(default)/parallel HTTP requests
- **books_per_request** - Books per API request, default 50, max 100

## Demo

See [demo](http://yikun.github.io/douban/).
