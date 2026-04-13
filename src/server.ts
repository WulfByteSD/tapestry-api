import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import db from './config/db';
import apiV1Routes from './route/v1/apiV1Routes';
import errorHandler from './middleware/error';
import socketConnection from './socket/socketConnection';
import executeGitPull from './utils/executeGitPull';
import fileUpload from 'express-fileupload';
import morgan from 'morgan';
// import { cronJobs } from ('./utils/cronJobs.js';
import path from 'path';
import cors from 'cors';
// import nodemon from 'nodemon';
import colors from 'colors';
import socket from './utils/socket';
import { cronJobs } from './cron/cronjobs';
//clustering
import cluster from 'cluster';
import os from 'os';
import NotificationService from './modules/notification/services/NotificationService';
import NCampaignActivityService from './modules/game/campaigns/service/NCampaignActivityService';

// Routes
//const middlewares
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const notificationService = new NotificationService();
notificationService.init();

new NCampaignActivityService().init();

const app = express();

const PORT = Number(process.env.PORT) || 5000;

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// using this allows us to accept body data
app.use(express.json({}));
app.use(fileUpload({ parseNested: false, useTempFiles: false, tempFileDir: '/tmp/' }));

// This is to help with CORS issues, we dont want to allow anyone but a select group to access routes
// app.use(cors(corsOptionsDelegate));
app.use(cors({ origin: '*' }));

//init middlewares
//sanitize data
app.use(
  mongoSanitize({
    onSanitize: ({ req, key }: any) => {
      console.warn(`Sanitized key: ${key}`);
    },
    allowDots: true, // if supported, check package docs
  })
);
//prevent XSS attacks
app.use(xss());
//prevent http paramter pollution
app.use(hpp());

app.use(express.static(path.join(__dirname, '../public')));
// app.use((req, res, next) => {
//   Object.defineProperty(req, 'query', {
//     set() {
//       console.trace('req.query assignment detected');
//     },
//   });
//   next();
// });
 
app.use('/api/v1', apiV1Routes);
app.post('/webhook', (req, res) => {
  console.info(`[Server]: Webhook received!`);
  // Process the webhook payload and execute Git pull
  executeGitPull(); 
  // Restart the server 
  restartServer(() => {
    console.info('[Server]: restarted successfully!');
    // Respond with a success status
    return res.sendStatus(200);
  });
});

// Function to restart the server
function restartServer(callback: any) {
  // nodemon.restart();
  callback();
}

// Init Middleware
// Has to be after routes, or the controllers cant use the middleware
app.use(errorHandler);

app.get('/', (req: Request, res: Response) => {
  res.status(201).sendFile(path.join(__dirname, '../public/index.html'));
});

const numCPUs = os.cpus().length;
const maxWorkers = Math.min(numCPUs, Number(process.env.CORE_CAP));

if (cluster.isPrimary) {
  console.info(`[Server]: Primary process ${process.pid} is running`.green);

  //fork workers
  for (let i = 0; i < maxWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.info(`[Server]: Worker ${worker.process.pid} died. Restarting...`.red);
    // cluster.fork();
  });
} else {
  // Connect to database
  db();
  //worker process runs the server
  const server = app.listen(PORT, () => {
    console.info(`[Server]: Server running; Worker ${process.pid} running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold);
    cronJobs();
  });

  socket.init(server);
  const io = socket.getIO();

  socketConnection(io);
}
