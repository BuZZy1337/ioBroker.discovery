'use strict';

var dns;
var ping;
var os;
var Netmask;

function pingOne(options, log, ip, callback) {
    ping.probe(ip, {log: log.debug, timeout: options.pingTimeout}, function (err, res) {
        if (err) log.error(err);
        if (res && res.alive) {
            log.debug('found ' + res.host);
            dns.reverse(res.host, function (err, hostnames) {
                callback(null, {_addr: res.host, _name: hostnames && hostnames.length ? hostnames[0] : res.host, _data: {names: hostnames}});
            });
        } else {
            callback(null, null);
        }
    });
}

function pingBlock(options, log, ips, callback) {
    var count = 0;
    var result = [];
    for (var i = 0; i < ips.length; i++) {
        count++;
        pingOne(options, log, ips[i], function (err, res) {
            if (err) log.error(err);
            if (res) {
                log.debug('found ' + JSON.stringify(res));
                result.push(res);
            }
            if (!--count) callback(null, result);
        });
    }
    if (!count) callback(null, result);
}

function pingBlocks(options, log, blocks, totalLength, progressCallback, callback, _result) {
    if (!blocks || !blocks.length) {
        callback(null, _result);
        return;
    }
    _result = _result || [];
    if (progressCallback) {
        progressCallback('ping', Math.round((totalLength - blocks.length) * 100 / totalLength));
    }

    var block = blocks.shift();
    pingBlock(options, log, block, function (err, result) {
        _result = _result.concat(result);
        setTimeout(pingBlocks, 0, options, log, blocks, totalLength, progressCallback, callback, _result);
    });
}

function pingRange(options, log, ip, subnet, progressCallback, callback) {
    Netmask = Netmask || require('netmask').Netmask;
    var block = new Netmask(ip + '/' + subnet);

    var blocks = [];
    var b = 0;
    block.forEach(function (_ip /* , long, index */) {
        if (ip === _ip) return;
        blocks[b] = blocks[b] || [];
        if (blocks[b].length >= options.pingBlock) {
            b++;
            blocks[b] = [];
        }
        blocks[b].push(_ip);
    });

    if (block.length > 100) {
        log.warn('Unable to ping all addresses: To big addresses range.');
        return callback('Unable to ping all addresses: To big addresses range.');
    }

    pingBlocks(options, log, blocks, blocks.length, progressCallback, callback);
}

function _pingAll(options, log, progressCallback, callback, ranges, _result) {
    dns  = dns  || require('dns');
    ping = ping || require(__dirname + '/ping/ping.js');
    os   = os   || require('os');

    if (typeof ranges === 'function') {
        callback = ranges;
        ranges = null;
    }
    _result = _result || [];

    if (!ranges) {
        var interfaces = os.networkInterfaces();
        ranges = [];
        for (var k in interfaces) {
            if (!interfaces.hasOwnProperty(k) || interfaces[k].internal) continue;
            for (var k2 in interfaces[k]) {
                if (!interfaces[k].hasOwnProperty(k2)) continue;
                var address = interfaces[k][k2];
                if (address.family === 'IPv4' && !address.internal) {
                    ranges.push({ip: address.address, mask: address.netmask});
                }
            }
        }
        return _pingAll(options, log, progressCallback, callback, ranges, _result);
    }
    if (!ranges.length) {
        callback(null, _result, 'ping');
    } else {
        var range = ranges.shift();
        pingRange(options, log, range.ip, range.mask, progressCallback, function (err, result) {
            _result = _result.concat(result);
            setTimeout(_pingAll, 0, options, log, progressCallback, callback, ranges, _result);
        });
    }
}

function pingAll(options, log, progressCallback, callback) {
    options.pingTimeout = Math.round(options.pingTimeout / 1000) || 1;
    options.pingBlock = parseInt(options.pingBlock, 10) || 20;
    _pingAll(options, log, progressCallback, callback);
}

exports.browse = pingAll;
exports.type = 'ip';
exports.options = {
    pingTimeout: {
        min: 1000,
        type: 'number'
    },
    pingBlock: {
        min: 1,
        max: 50,
        type: 'number'
    }
};
