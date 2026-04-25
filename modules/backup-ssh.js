let Ssh2SftpClient = require('ssh2-sftp-client');
let fs = require('node:fs');
let { $utils } = require('./utils');

class BackupSsh {
  constructor({ backup, backupSsh }) {
    for (let key in this.backup) {
      this.backup[key] = backup[key];
    }
    for (let key in this.backupSsh) {
      this.backupSsh[key] = backupSsh[key];
    }
  }

  backup = {
    rootDir: '',
  };

  backupSsh = {
    rootDir: '',
    settingsPath: '',
    privateKeyPath: '',
    publicKeyPath: '',
  };
  // Set backup SSH settings
  async setSettings({ host, port, username, remoteDir, publicKey, keyAlgorithm }) {
    await $utils.createDir(this.backupSsh.rootDir);
    if (!publicKey) {
      await $utils.removeFile(this.backupSsh.privateKeyPath);
      await $utils.removeFile(this.backupSsh.publicKeyPath);
      await this.createSshKeys({
        keyAlgorithm,
        keyPath: this.backupSsh.privateKeyPath,
      });
    }
    let jsonSettings = JSON.stringify({ host, port, username, remoteDir }, null, 2);
    await fs.promises.writeFile(this.backupSsh.settingsPath, jsonSettings, 'utf8');
    console.log(`--> Completed: settings + SSH keys`);
    let settings = await this.getSettings();
    return settings;
  }

  // Get settings
  async getSettings() {
    let privateKey = await fs.promises.readFile(this.backupSsh.privateKeyPath, 'utf8');
    let publicKey = await fs.promises.readFile(this.backupSsh.publicKeyPath, 'utf8');
    let settings = JSON.parse(await fs.promises.readFile(this.backupSsh.settingsPath, 'utf8'));
    return { publicKey, privateKey, ...settings };
  }

  // Send backup to remote server using SSH
  async sendBackup({ backupId, dateCreate }) {
    let startTransport = new Date().toISOString();
    let { host, port, username, privateKey, remoteDir } = await this.getSettings();
    let sftp = new Ssh2SftpClient();
    try {
      await sftp.connect({ host, port, username, privateKey, readyTimeout: 20000 });
      console.log('--> Start upload backup');
      // Upload backup files
      await sftp.uploadDir(this.backup.rootDir, `${remoteDir}/${dateCreate}_${backupId}`);
      console.log('--> End upload backup');
      let endTransport = new Date().toISOString();
      return { dateStart: startTransport, dateEnd: endTransport };
    } finally {
      await sftp.end();
    }
  }

  // Download a backup from a remote server via SSH (srcFullPath - path to the folder on the remote server)
  async downloadBackup({ remoteDirPath }) {
    let startTransport = new Date().toISOString();
    let { host, port, username, privateKey } = await this.getSettings();
    let sftp = new Ssh2SftpClient();
    try {
      await sftp.connect({ host, port, username, privateKey, readyTimeout: 20000 });
      let isExist = await sftp.exists(remoteDirPath);
      if (!isExist) {
        throw new Error(`The path does not exist on the remote server: ${remoteDirPath}`);
      }
      await $utils.removeDir(this.backup.rootDir);
      await $utils.createDir(this.backup.rootDir);
      console.log('--> Start download backup');
      // Download backup files
      await sftp.downloadDir(remoteDirPath, this.backup.rootDir);
      console.log('--> End download backup');
      let endTransport = new Date().toISOString();
      return { dateStart: startTransport, dateEnd: endTransport };
    } finally {
      await sftp.end();
    }
  }

  // Check connection to remote SSH server
  async checkConnection() {
    let { host, port, username, privateKey } = await this.getSettings();
    let sftp = new Ssh2SftpClient();
    try {
      await sftp.connect({ host, port, username, privateKey, readyTimeout: 20000 });
      console.log('--> Check connection to SSH server successful');
    } finally {
      sftp.end();
    }
  }

  // Create ssh keys
  async createSshKeys({ keyAlgorithm, keyPath }) {
    await $utils.runCommandSpawn({
      command: 'ssh-keygen',
      args: ['-t', keyAlgorithm, '-f', keyPath, '-P', '', '-N', ''],
    });
  }
}

module.exports = BackupSsh;
