let express = require('express')
let variables = require('./modules/variables');
let Backup = require('./modules/backup');
let Report = require('./modules/report');
let BackupSsh = require('./modules/backup-ssh');
let { BACKUP__SERVER_PORT, APP_SECRET_KEY } = process.env;

let host = '0.0.0.0';
let port = BACKUP__SERVER_PORT;
// To block access to the server
let isBlockAccess = false;
// To notify that a backup is being sent to a remote server
let processStatus = null;
// The last countdown will be stored until the first request
let reportLast = null;

let app = express()
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

process.on('uncaughtException', async function (error) {
  let report = new Report(variables);
  // The report will be available on the host machine (via volume)
  await report.createReportError({ error, reportPath: variables.reportErrorPath });
  process.exit(1);
});

// Check access to the server
app.use(async (request, response, next) => {
  if (isBlockAccess) {
    response.status(202);
    response.send({ processStatus });
  } else {
    next();
  }
});

// Check secret key for communication between services
app.use(async (request, response, next) => {
  let secretKey = request.query.secretKey;
  if (secretKey === APP_SECRET_KEY) {
    next();
  } else {
    response.sendStatus(403);
  }
});

// Checking service availability
app.get('/check-status', async (request, response) => {
  response.send({ processStatus });
});

// Get last report
app.get('/report', async (request, response) => {
  response.send(reportLast);
  reportLast = null;
  processStatus = null;
});

// Create backup
app.post('/backup', async (request, response) => {
  isBlockAccess = true;
  // Sending occurs without waiting for the results
  response.send(true);
  try {
    let backupSsh = new BackupSsh(variables);
    await backupSsh.checkConnection();
    let backup = new Backup(variables);
    let resultBackup = await backup.createBackup();
    let report = new Report(variables);
    let backupId = request.body.backupId;
    reportLast = await report.createReport({ resultBackup, backupId });
    processStatus = 'send';
    await backupSsh.sendBackup(request.body);
    processStatus = 'completed';
  } catch(error) {
    processStatus = 'error';
    reportLast = { error: error.stack };
  } finally {
    isBlockAccess = false;
  }
});

// Set settings for ssh backup
app.post('/settings-backup-ssh', async (request, response) => {
  isBlockAccess = true;
  let backupSsh = new BackupSsh(variables);
  let { publicKey } = await backupSsh.setSettings(request.body);
  isBlockAccess = false;
  response.send({ publicKey });
});

// Catch 404 and forward to error handler
app.use(function (request, response, next) {
  response.sendStatus(404);
});

// Error handler
app.use(function (error, request, response, next) {
  isBlockAccess = false;
  response.status(500);
  response.send(reportLast);
});

// Start server
app.listen(port, () => {
  console.log(`Backup server is running on http://${host}:${port}`);
});

