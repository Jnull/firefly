//http://ffmpeg.zeranoe.com/builds/
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
process.env.FFMPEG_PATH = "ffmpeg.exe";
process.env.FFPROBE_PATH = __dirname + "\\ffmpeg.exe";
process.env.FFMPEG_BIN_PATH = __dirname + "\\ffmpeg.exe";

var LISTEN_PORT = 8000;
//streams
var fs = require('fs'); //https://nodejs.org/api/fs.html
var ytdl = require('ytdl-core');  //https://www.npmjs.com/package/ytdl-core
var rest = require('follow-redirects').https;  //https://www.npmjs.com/package/follow-redirects
var request = require('request');  //https://github.com/request/request
var ffmpeg = require('fluent-ffmpeg');  //https://www.npmjs.com/package/fluent-ffmpeg
var Throttle = require('throttle');  //https://github.com/TooTallNate/node-throttle
var probe = require('node-ffprobe'); //https://github.com/ListenerApproved/node-ffprobe
var WebSocket = require('ws');
var client = new WebSocket('wss://null1.soundtrack.io/stream/websocket');

var throttle;

//Manual Testing
//var Speaker = require('speaker');  //https://www.npmjs.com/package/speaker
//var lame = require('lame'); //https://www.npmjs.com/package/lame

// create the Encoder instance (Takes Raw PCM data and writes to a valid mp3 stream)
//var encoder = new lame.Encoder({
//    // input
//    channels: 2,        // 2 channels (left and right)
//    bitDepth: 16,       // 16-bit samples
//    sampleRate: 44100,  // 44,100 Hz sample rate
//    // output
//    bitRate: 128,
//    outSampleRate: 22050,
//    mode: lame.STEREO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
//});
//
//// create the Decoder instance (Takes MP3 data and writes to a Raw PCM data stream (Speaker module accepts PCM data only)
//var decoder = new lame.Decoder({
//    // input
//    channels: 2,        // 2 channels (left and right)
//    bitDepth: 16,       // 16-bit samples
//    sampleRate: 44100,  // 44,100 Hz sample rate
//    // output
//    out: new Speaker,
//    bitRate: 128,
//    outSampleRate: 22050,
//    mode: lame.STEREO // STEREO (default), JOINTSTEREO, DUALCHANNEL or MONO
//
//});

var stream;
var x1Stream;
var x2Stream;
///////EXPRESS\\\\\\
var express = require('express');
var app = express();
//app.set('etag', false);
//app.set('lastModified', false);
//app.set('cacheControl', false);

client.on('message', function (message) {
    try {
        message = JSON.parse(message);
    } catch (e) {
        message = {};
    }

    switch (message.type) {
        default:
            console.log('unhandled message type', message.type);
            break;
        case 'ping':
            console.log('server pinged. playing pong.');
            client.send('{"type": "pong"}');
            break;
        case 'announcement':
            console.log('server announcement.');
            console.log(message);
            break;
        case 'playlist:add':
            console.log("Playlist added message came through");
            break;
        case 'playlist:updated':
            console.log("Playlist update message came through");
            break;
        case 'track':
            sources = [];
            //console.log('track!');
            //steam.unpipe();
            newStream({streamLinks: message.data});
            break;
    }
});

function newStream({streamLinks}) {
    streamLinks.sources['youtube'].forEach(function (item) {
        var src = {source: 'youtube', url: `https://www.youtube.com/watch?v=${item.id}`};
        sources.push(src);
    });

    streamLinks.sources['soundcloud'].forEach(function (item) {
        var src = {
            source: 'soundcloud',
            //url: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=5a7c84b79d2c8bea993943629ba45c9b`
            url: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=a3e059563d7fd3372b49b37f00a00bcf`
            //url: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=b45b1aa10f1ac2941910a7f0d10f8e28 `
            //url: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=07bcbafd1ecee7cde9f8efc7335d2e9f`
            //url: `https://api.soundcloud.com/tracks/${item.id}/stream?client_id=7665f7926ea90a6880b9912322980c5c`
        };
        sources.push(src);
    });

    nextSong();
}

function nextSong() {
    var streaming = false;
    var i = 0;

    var tester = setInterval(function () {
        if (streaming) return;
        console.log(`trying sources[${i}]`);
        var source = sources[i];
        i++;
        if (!source) return stopSearching();
        //console.log(source.url);

        console.log(source.source);
        switch (source.source) {
            case 'youtube':
                // https://www.npmjs.com/package/ytdl-core
                var stream = ytdl(source.url, {
                    filter: function (format) {
                        //console.log(format.container);
                        return (format.container === 'webm');
                    }
                    , quality: 'highest'
                })
                    .on("progress", function (cl, td, tdl) {
                        //console.log(cl, td, tdl); these download numbers don't add up to fprobe :(
                    })
                    .on('finish', function (x) {
                        console.log('ytdl has finished!');
                    })
                    .once('data', stopSearching)
                    .on('error', handleError);

                var proc = new ffmpeg(stream)
                    .withAudioCodec('libmp3lame')
                    .toFormat('mp3')
                    .audioBitrate('128k')
                    .save("track.mp3", function (stdout, stderr) {
                        console.log('file has been converted succesfully');
                    }).on('end', function (x) {
                    console.log('ffmpeg has ended!');
                    probe("track.mp3", function (err, probeData) {
                        bit_rate = probeData.format.bit_rate;
                        //highWaterMark
                        //The amount of data potentially buffered depends on the highWaterMark option passed into the streams constructor. For normal streams,
                        // the highWaterMark option specifies a total number of bytes. For streams operating in object mode, the highWaterMark specifies a total number of objects.
                        //throttle = new Throttle({ bps: (bit_rate/10) * 1.4, chunkSize: 100, highWaterMark: 500 }); //default for reference - don't change this line!
                        throttle = new Throttle({bps: (bit_rate / 10) * 1.4, chunkSize: 100, highWaterMark: 500});
                        //if(x2Stream.unpipe)
                        x1Stream = fs.createReadStream('track.mp3').pipe(throttle, {end: false});
                    });
                });


                break;
            case 'soundcloud':
                console.log(source.url);

                //request(source.url).pipe(fs.createWriteStream('track1.mp3'));
                //rest.get(source.url, xres => xres.pipe(fs.createWriteStream('track1.mp3')));
                //http.get('some_mp3_url', res => res.pipe(fs.createWriteStream('some.mp3')));

                rest.get(source.url, function (response) {
                    console.log('response url:' + response.responseUrl);
                    response.once('data', stopSearching);
                    response.on('error', handleError);

                    var proc = new ffmpeg(response)
                        .withAudioCodec('libmp3lame')
                        .toFormat('mp3')
                        .audioBitrate('128k')
                        .save("track.mp3", function (stdout, stderr) {
                            console.log('file has been converted succesfully');
                        });

                    proc.on('end', function (x) {
                        console.log('ffmpeg has ended!');
                        probe("track.mp3", function (err, probeData) {
                            bit_rate = probeData.format.bit_rate;
                            //highWaterMark
                            //The amount of data potentially buffered depends on the highWaterMark option passed into the streams constructor. For normal streams,
                            // the highWaterMark option specifies a total number of bytes. For streams operating in object mode, the highWaterMark specifies a total number of objects.
                            //throttle = new Throttle({ bps: (bit_rate/10) * 1.4, chunkSize: 100, highWaterMark: 500 }); //default for reference - don't change this line!
                            throttle = new Throttle({bps: (bit_rate / 10) * 1.4, chunkSize: 100, highWaterMark: 500});
                            //if(x1Stream.unpipe)
                            x2Stream = fs.createReadStream('track.mp3').pipe(throttle, {end: false});
                        });
                    });
                });

                break;
        }


    }, 5000);


    var stopSearching = (data) => {
        console.log('stopping search!', data && data.length);
        streaming = true;
        //sources = []; //added to clear youtube sources, or the same song keeps playing..
        clearInterval(tester);
    };
}
app.listen(LISTEN_PORT, function () {
    console.log(`Example app listening on port ${LISTEN_PORT}`)
});

app.get('/', function (req, res, next) {
    res.useChunkedEncodingByDefault = false; //http://stackoverflow.com/questions/28010909/stream-audio-simultaneously-from-soundcloud-source-with-node
    res.setHeader('Content-type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');  //a 3rd of players don't support chunked so turning this off is considerd a good idea? - http://stackoverflow.com/questions/38156139/stream-audio-from-nodejs-to-html5-audio-tag
    //These headers seem to break simultaneous playback between all new clients (Starts them from the beginning of the song again!?!)
    //res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    //res.setHeader('Pragma', 'no-cache');
    //res.setHeader('Expires', '0');
    throttle.pipe(res, {end: false});
});

var handleError = (err) => {
    switch (err.Error) {
        default:
            console.log("Something Happened Error");
            console.log(err);
            break;
        case 'read ECONNRESET':
            console.log('There was a connection reset somewhere');
            break;
    }
    console.log(err + "ERROR CODE: NULL");
};
