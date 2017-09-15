/* jshint esversion: 6 */
/* global __dirname */
(() => {
  'use strict';

  const request = require('request');
  const moment = require('moment');
  const config = require('./config.json');
  const FCM = require('fcm-push');
  const fcm = new FCM(config['firebase']['server-key']);
  const fs = require('fs');
  const _ = require('lodash');
  moment.locale('fi');
  
  const getEvents = () => {
    return new Promise((resolve, reject) => {
      request({
        method: 'GET',
        url: 'http://www.madmikkeli.com/wp-json/eventon/events',
        json: true
      }, (err, response, body) => {
        if (err) {
          reject(err);
        } else {
          const events = [];

          _.forEach(body.events, (event, id) => {
            event.start = parseInt(event.start) * 1000;
            event.end = parseInt(event.end) * 1000;
            event.id = id;
            event.dateString = moment.utc(event.start).format('DD.M.');
            event.timeString = `${moment.utc(event.start).format('H:mm')} - ${moment.utc(event.end).format('H:mm')}`;
            if (event['location_lat'] && event['location_lon']) {
               event['location_lat'] = Number(event['location_lat']);
               event['location_lon'] = Number(event['location_lon']);
            }
            const eventTypes = [];
            _.forEach(event['event_type'], (eventType) => {
              eventTypes.push(eventType);
            });
            event['event_type'] = eventTypes;
            events.push(event);
          });
          
          resolve(events);   
        }
      });
    });
  };
  
  const listEventsByEventType = (eventType) => {
    return getEvents()
      .then((events) => {
        return _.filter(events, (event) => { return event['event_type'].indexOf(eventType) > -1; });
      });
  };
  
  const readJson = function() {
    return JSON.parse(fs.readFileSync('notification.json', 'utf8'));
  };

  const writeJson = (data) => {
    fs.writeFileSync('notification.json', JSON.stringify(data));
  };
  
  const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
  };
  
  const isEventEndedToday = (event) => {
    const now = moment();
    const eventEnd = moment.utc(event.end);
    if (now.hours() > eventEnd.hours()) {
      return true;
    } else if (eventEnd.hours() > now.hours()) {
      return false;
    } else {
      if (eventEnd.minutes() > now.minutes()) {
        return false;
      } else {
        return true;
      }
    }
  };

  const isEventStartedToday = (event) => {
    const now = moment();
    const eventStart = moment.utc(event.start);
    if (now.hours() > eventStart.hours()) {
      return true;
    } else if (eventStart.hours() > now.hours()) {
      return false;
    } else {
      if (eventStart.minutes() > now.minutes()) {
        return false;
      } else {
        return true;
      }
    }
  };
  
  const sendNotification = (event) => {
     const notificationSettings = {
        title: 'Tapahtuma alkamassa',
        body: `${event.name} alkaa juuri nyt.`
      };
      
      const message = {
        to: '/topics/eventstart',
        notification: notificationSettings
      };
      
      return fcm.send(message);
  };
  
  
  const checkEvents = () => {
    const dateSlug = capitalizeFirstLetter(moment().format('dddd-D'));
    listEventsByEventType(dateSlug)
      .then((events) => {

      const notificationData = readJson();
      if (!notificationData[dateSlug]) {
        notificationData[dateSlug] = [];
      }

      for (let i = 0; i < events.length; i++) {
        let event = events[i];
        if (isEventEndedToday(event) || notificationData[dateSlug].indexOf(event.id) !== -1) {
          continue;
        }
        if (isEventStartedToday(event)) {
          sendNotification(event)
            .then(() => {
              console.log('sent notification for ' + event.name);
              notificationData[dateSlug].push(event.id);
              writeJson(notificationData);
            });
        }
      }
      
 
    });
  };

  setInterval(() => {
    checkEvents();
  }, 1000 * 60 * 5);

})();