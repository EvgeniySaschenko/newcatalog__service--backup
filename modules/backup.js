let fs = require('node:fs');
let child_process = require('node:child_process');
let stream = require('node:stream/promises');

let { 
  DB_MAIN__NAME_DB,
  DB_MAIN__USER_DB,
  DB_MAIN__PASSWORD_DB,
  DB_MAIN__PORT_INTERNAL,
  DB_MAIN__SERVICE,
} = process.env;


class Backup {
  constructor({ storageFilesDir, backup }) {
    this.storageFilesDir = storageFilesDir;
    for(let key in this.backup) {
      this.backup[key] = backup[key];
    }
  }

  storageFilesDir = '';
  backup = {
    rootDir: '',
    storageFilesDir: '',
    dbDir: '',
    dbStructurePath: '',
    dbDataPath: '',
    dbTranslationsPath: '',
  }

  // Create backup
  async createBackup() {
    console.log('--> Starting backup');
    let databaseStart = new Date().toISOString();
    let db = DB_MAIN__NAME_DB;
    let user = DB_MAIN__USER_DB;
    let port = DB_MAIN__PORT_INTERNAL;
    let host = DB_MAIN__SERVICE;
    let env = { ...process.env, PGPASSWORD: DB_MAIN__PASSWORD_DB }

    // remove backup dir
    await this.removeDir(this.backup.rootDir);
    // create backup dir
    await this.createDir(this.backup.rootDir);
    // create database dir
    await this.createDir(this.backup.dbDir);

    // schema
    let dumpSchema = child_process.spawn('pg_dump', [
      '-d', db, '-p', port, '-U', user, '-h', host, '--schema-only'
    ], { env});
    await this.writeDatabaseFile(dumpSchema, this.backup.dbStructurePath);

    // data
    let dumpData = child_process.spawn('pg_dump', [
      '-d', db, '-p', port, '-U', user, '-h', host, '-Fc'
    ], { env });
    await this.writeDatabaseFile(dumpData, this.backup.dbDataPath);

    // translations
    let dumpTranslations = child_process.spawn('pg_dump', [
      '-d', db, '-p', port, '-U', user, '-h', host, '-t', 'translations'
    ], { env });
    await this.writeDatabaseFile(dumpTranslations, this.backup.dbTranslationsPath);
    let databaseEnd = new Date().toISOString();


    let storageFilesStart = new Date().toISOString();
    // create files dir
    await this.createDir(this.backup.storageFilesDir);
    // copy files
    await this.copyFilesStorage();
    let storageFilesEnd = new Date().toISOString();

    console.log('--> Backup completed');
    return { databaseStart, databaseEnd, storageFilesStart, storageFilesEnd };
  }

  // Write database file
  async writeDatabaseFile(dump, filePath) {
    let fnName = 'writeDatabaseFile';
    let writeStream = fs.createWriteStream(filePath);

    // handlers events child_process
    let handlerChildProcess = new Promise((resolve, reject) => {
      dump.once('error', (error) => reject(
        Object.assign(error, { source: `spawn (${fnName})`, filePath })
      ));
      dump.once('close', (code) => resolve(code));
    });

    // handlers streams (add info)
    dump.stdout.once('error', (error) => (
      Object.assign(error, { source: `stdout (${fnName})`, filePath })
    ));
    writeStream.once('error', (error) => (
      Object.assign(error, { source: `writeStream (${fnName})`, filePath })
    ));

    // warnings may appear here output is only to the console
    dump.stderr.on('data', (data) => {
      console.warn({ filePath, warn: data.toString() });
    });


    let [_, code] = await Promise.all([
      stream.pipeline(dump.stdout, writeStream),
      handlerChildProcess,
    ]);

    // error
    if (code !== 0) {
      throw Object.assign(new Error('pg_dump failed'), {
        source: `pg_dump (${fnName})`,
        code,
        filePath,
      });
    }
    console.log(`--> File completed: "${filePath}"`);
  }

  // Copy files storage
  async copyFilesStorage() {
    await fs.promises.cp(this.storageFilesDir, this.backup.storageFilesDir, { 
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
    });
    console.log(`--> Copied to "${this.backup.storageFilesDir}"`);
  }

  // Check exist dir
  async isExistDir(dirPath) {
    try {
      await fs.promises.stat(dirPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  // Create dir
  async createDir(dirPath) {
    let isExist = await this.isExistDir(dirPath);
    if (isExist) return;
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`--> Directory created "${dirPath}"`);
  }

  // Remove dir with all content
  async removeDir(dirPath) {
    let isExist = await this.isExistDir(dirPath);
    if (!isExist) return;
    await fs.promises.rm(dirPath, { recursive: true });
    console.log(`--> Directory removed "${dirPath}"`);
  }
}

module.exports = Backup;
