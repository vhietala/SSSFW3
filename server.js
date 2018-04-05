'use strict';

const express = require('express');
const app = express();

const https = require('https');
const fs = require('fs-extra');
const http = require('http');

const multer = require('multer');
const upload = multer({dest: 'public/original/'});

const sharp = require('sharp');
const ExifImage = require('exif').ExifImage;

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const dotenv = require('dotenv').config();

const jsonfile = require('jsonfile');

const moment = require('moment');

app.use(express.static('public'));

const sslkey = fs.readFileSync('ssl-key.pem');
const sslcert = fs.readFileSync('ssl-cert.pem');

const callback = (err, data) => {
  if (err) {
    return console.error(err);
  }
  else {
    console.log(data);
  }
};

const picSchema = new Schema({
  //_id: Number,
  time: Date,
  category: String,
  title: String,
  details: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
  thumbnail: String,
  image: String,
  original: String,
});

mongoose.connect(
    `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`).
    then(() => {
      console.log('Connected successfully.');
      http.createServer((req, res) => {
        res.writeHead(301, {
          'Location': `https://${process.env.APP_HOST}:${process.env.APP_PORT}` +
          req.url,
        });
        res.end();
      }).listen(8080);
      const options = {
        key: sslkey,
        cert: sslcert,
      };
      https.createServer(options, app).listen(process.env.APP_PORT);
    }, err => {
      console.log('Connection to db failed: ' + err);
    });

const Pic = mongoose.model('Pic', picSchema);

app.get('/getdata', (req, res) => {
  Pic.find().then(d => {
    res.send(d);
  });
});

app.get('/find/:param', (req, res) => {
  const searchParam = ''+req.params.param;
  Pic.find({'category' : searchParam}).then(d => {
    console.log(d);
    res.send(d);
  });
});

app.delete('/delete/:param1', (req, res) => {
  console.log('delete: ' + req.params.param1);
  const deleteId = '' + req.params.param1;
  Pic.findOne({'_id': deleteId}).then(d => {
    console.log('/' + d.thumbnail);
    fs.remove('public/' + d.thumbnail).then(() => {
      console.log('success!');
    }).catch(err => {
      console.error(err);
    });
    fs.remove('public/' + d.original).then(() => {
      console.log('success!');
    }).catch(err => {
      console.error(err);
    });
    fs.remove('public/' + d.image).then(() => {
      console.log('success!');
    }).catch(err => {
      console.error(err);
    });
    d.remove().then(() => {
      res.sendStatus(200);
    });
  });
});

app.get('/edit/:param1', (req, res) => {
  const editID = '' + req.params.param1;
  Pic.findOne({'_id': editId}).then(d => {

    res.sendStatus(200);
  });
});

const gpsToDecimal = (gpsData, hem) => {
  let d = parseFloat(gpsData[0]) + parseFloat(gpsData[1] / 60) +
      parseFloat(gpsData[2] / 3600);
  return (hem === 'S' || hem === 'W') ? d *= -1 : d;
};

app.post('/new', upload.single('file'), function(req, res, next) {
  req.body.time = moment();
  req.body.original = 'original/' + req.file.filename;
  console.log(req.body.coordinates);
  req.body.coordinates = JSON.parse(req.body.coordinates);
  next();
});

app.use((req, res, next) => {
  try {
    new ExifImage({image: req.file.path}, function(error, exifData) {
      if (error) {
        console.log('Error: ' + error.message);
        next();
      } else {
        console.log(JSON.stringify(exifData.gps));
        req.body.coordinates = {
          lat: gpsToDecimal(exifData.gps.GPSLatitude,
              exifData.gps.GPSLatitudeRef),
          lng: gpsToDecimal(exifData.gps.GPSLongitude,
              exifData.gps.GPSLongitudeRef),
        };
        next();
      }
    });
  } catch (error) {
    console.log('Error: ' + error.message);
    next();
  }
});

app.use((req, res, next) => {
  const thumbPath = 'thumb/' + req.file.filename;

  sharp('public/original/' + req.file.filename).
      resize(320, 300).
      toFile('public/' + thumbPath, (err, info) => {
        console.log(err);
        //console.log(info);
        req.body.thumbnail = thumbPath;
        next();
      });
});

app.use((req, res, next) => {
  const medPath = 'img/' + req.file.filename;

  sharp('public/original/' + req.file.filename).
      resize(770, 720).
      toFile('public/' + medPath, (err, info) => {
        console.log(err);
        // console.log(info);
        req.body.image = medPath;
        console.log(JSON.stringify(req.body));
        next();
      });
});

app.use((req, res, next) => {
  const file = 'public/data.json';
  let json = null;
  jsonfile.readFile(file, (err, obj) => {
    json = obj;
    json.push(req.body);
    jsonfile.writeFile(file, obj, (err) => {
      console.error(err);
    });
  });
  res.send(json);
  next();
});

app.use((req, res, next) => {
  Pic.create(req.body).then(data => {
    //console.log(data);
    res.sendStatus(200);
  });
});



