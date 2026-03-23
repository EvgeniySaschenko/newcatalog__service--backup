let Ssh2SftpClient = require('ssh2-sftp-client');
let fs = require('node:fs');
let child_process = require('node:child_process');

class BackupSsh {
  constructor({ backup, backupSsh }) {
    for(let key in this.backup) {
      this.backup[key] = backup[key];
    }
    for(let key in this.backupSsh) {
      this.backupSsh[key] = backupSsh[key];
    }
  }

  backup = {
    rootDir: '',
  }

  backupSsh = {
    rootDir: '',
    settingsPath: '',
    privateKeyPath: '',
    publikKeyPath: '',
  }
  // Set backup SSH settings
  async setSettings({ host, port, username, remoteDir, publicKey, keyAlgorithm }) {
    await this.createDir(this.backupSsh.rootDir);
    if (!publicKey) {
      await this.removeFile(this.backupSsh.privateKeyPath);
      await this.removeFile(this.backupSsh.publikKeyPath);
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
    let publicKey = await fs.promises.readFile(this.backupSsh.publikKeyPath, 'utf8');
    let settings = JSON.parse(await fs.promises.readFile(this.backupSsh.settingsPath, 'utf8'));
    return { publicKey, privateKey, ...settings };
  }

  // Send backup to remote server using SSH
  async sendBackup({ backupId, dateCreate }) {
    let startTransport = new Date().toISOString();
    let { host, port, username, privateKey, remoteDir } = await this.getSettings();
    let sftp = new Ssh2SftpClient();
    try {
      await sftp.connect({ host, port, username, privateKey });
      console.log('--> Start send backup');
      // Upload backup files
      await sftp.uploadDir(this.backup.rootDir, `${remoteDir}/${dateCreate}_${backupId}`);
      console.log('--> End send backup');
      let endTransport = new Date().toISOString();
      return { dateStart: startTransport, dateEnd: endTransport };
    } catch (error) {
      throw error;
    } finally {
      await sftp.end();
    }
  }

  // Check connection to remote SSH server
  async checkConnection() {
    let { host, port, username, privateKey } = await this.getSettings();
    let sftp = new Ssh2SftpClient();
    try {
      await sftp.connect({ host, port, username, privateKey });
      console.log('--> Check connection to SSH server successful');
    } catch (error) {
      throw error;
    } finally {
      sftp.end();
    }
  }

  // Create ssh keys
  async createSshKeys({ keyAlgorithm, keyPath }) {
    let fnName = 'createSshKeys';
    let keygen = child_process.spawn('ssh-keygen', [
      '-t', keyAlgorithm,
      '-f', keyPath,
      '-P', '',
      '-N', '',
    ]);

    await new Promise((resolve, reject) => {
      keygen.stderr.once('data', (data) => {
        let error = Object.assign({ error: data.toString() }, { source: `stderr (${fnName})` });
        reject(error);
      });

      keygen.once('close', (code) => {
        if (code) {
          let error = new Error(`${fnName} code: ${code}`);
          reject(error);
        }
        resolve();
      });
    });
  }

  // Check exist dir
  async isExistPath(curentPath) {
    try {
      await fs.promises.stat(curentPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  // Remove file
  async removeFile(filePath) {
    let isExist = await this.isExistPath(filePath);
    if (!isExist) return;
    await fs.promises.unlink(filePath);
    console.log(`--> File removed "${filePath}"`);
  }

  // Create dir
  async createDir(dirPath) {
    let isExist = await this.isExistPath(dirPath);
    if (isExist) return;
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`--> Directory created "${dirPath}"`);
  }

  // Remove dir with all content
  async removeDir(dirPath) {
    let isExist = await this.isExistPath(dirPath);
    if (!isExist) return;
    await fs.promises.rm(dirPath, { recursive: true });
    console.log(`--> Directory removed "${dirPath}"`);
  }
}

module.exports = BackupSsh;
