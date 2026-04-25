let fs = require('node:fs');
let child_process = require('node:child_process');
let stream = require('node:stream/promises');
let { $utils } = require('./utils');

let {
  DB_MAIN__NAME_DB,
  DB_MAIN__USER_DB,
  DB_MAIN__PASSWORD_DB,
  DB_MAIN__PORT_INTERNAL,
  DB_MAIN__SERVICE,
} = process.env;

class Backup {
  constructor({ storage, backup }) {
    for (let key in this.backup) {
      this.backup[key] = backup[key];
    }

    for (let key in this.storage) {
      this.storage[key] = storage[key];
    }
  }

  storage = {
    filesDir: '',
    filesDirOld: '',
    filesDirRestore: '',
  };

  backup = {
    rootDir: '',
    storageFilesDir: '',
    dbDir: '',
    dbStructurePath: '',
    dbDataPath: '',
    dbTranslationsPath: '',
  };

  // Create backup
  async createBackup() {
    console.log('--> Starting backup');
    let databaseStart = new Date().toISOString();
    let db = DB_MAIN__NAME_DB;
    let user = DB_MAIN__USER_DB;
    let port = DB_MAIN__PORT_INTERNAL;
    let host = DB_MAIN__SERVICE;
    let env = { ...process.env, PGPASSWORD: DB_MAIN__PASSWORD_DB };

    // remove backup dir
    await $utils.removeDir(this.backup.rootDir);
    // create backup dir
    await $utils.createDir(this.backup.rootDir);
    // create database dir
    await $utils.createDir(this.backup.dbDir);

    // schema
    let dumpSchema = child_process.spawn(
      'pg_dump',
      ['-d', db, '-p', port, '-U', user, '-h', host, '--schema-only', '--no-password'],
      { env }
    );
    await this.writeDatabaseFile(dumpSchema, this.backup.dbStructurePath);

    // data
    let dumpData = child_process.spawn(
      'pg_dump',
      ['-d', db, '-p', port, '-U', user, '-h', host, '-Fc', '--no-password'],
      { env }
    );
    await this.writeDatabaseFile(dumpData, this.backup.dbDataPath);

    // translations
    let dumpTranslations = child_process.spawn(
      'pg_dump',
      ['-d', db, '-p', port, '-U', user, '-h', host, '-t', 'translations', '--no-password'],
      { env }
    );
    await this.writeDatabaseFile(dumpTranslations, this.backup.dbTranslationsPath);
    let databaseEnd = new Date().toISOString();

    let storageFilesStart = new Date().toISOString();
    // create files dir
    await $utils.createDir(this.backup.storageFilesDir);
    // copy files
    await this.copyFilesStorage(this.storage.filesDir, this.backup.storageFilesDir);
    let storageFilesEnd = new Date().toISOString();

    console.log('--> Backup completed');
    return { databaseStart, databaseEnd, storageFilesStart, storageFilesEnd };
  }

  // !!! при отсувии пароля к БД не выдаёт ошибку
  // Restore backup
  async restoreBackup() {
    console.log('--> Starting restore backup');
    let restoreStart = new Date().toISOString();
    let db = DB_MAIN__NAME_DB;
    let user = DB_MAIN__USER_DB;
    let port = DB_MAIN__PORT_INTERNAL;
    let host = DB_MAIN__SERVICE;
    let env = { ...process.env, PGPASSWORD: DB_MAIN__PASSWORD_DB };
    let dbRestore = `${db}_restore`;
    let dbOld = `${db}_old`;
    let isRollBack = {
      dbRestore: false,
      storageFilesDirOld: false,
      dbOld: false,
    };

    function sqlRenameDatabase(nameCurrent, nameNew) {
      return `
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '${nameCurrent}' AND pid <> pg_backend_pid();
        ALTER DATABASE ${nameCurrent} RENAME TO ${nameNew};
      `;
    }

    let movedItems = [];

    try {
      // Delete temporary database
      await $utils.runCommandSpawn({
        command: 'dropdb',
        args: ['-h', host, '-p', port, '-U', user, '--if-exists', '-f', dbRestore, '--no-password'],
        options: { env },
      });

      // Create a database to restore the backup to (a temporary database name will be used)
      await $utils.runCommandSpawn({
        command: 'createdb',
        args: ['-h', host, '-p', port, '-U', user, '-O', user, dbRestore, '--no-password'],
        options: { env },
      });

      isRollBack.dbRestore = true;

      // Restore the database to a temporary database
      await $utils.runCommandSpawn({
        command: 'pg_restore',
        args: [
          '-d',
          dbRestore,
          '-h',
          host,
          '-p',
          port,
          '-U',
          user,
          this.backup.dbDataPath,
          '--no-password',
        ],
        options: { env },
      });

      // Copy current files to a temporary folder (in case of unsuccessful recovery)
      let storageItems = await fs.promises.readdir(this.storage.filesDir);
      await $utils.createDir(this.storage.filesDirOld);

      isRollBack.storageFilesDirOld = true;

      for await (let item of storageItems) {
        await fs.promises.rename(
          `${this.storage.filesDir}/${item}`,
          `${this.storage.filesDirOld}/${item}`
        );
        movedItems.push(item);
      }
      await this.copyFilesStorage(this.backup.storageFilesDir, this.storage.filesDir);

      // Rename the current database (to free up the name)
      await $utils.runCommandSpawn({
        command: 'psql',
        args: [
          '-h',
          host,
          '-p',
          port,
          '-U',
          user,
          '-c',
          sqlRenameDatabase(db, dbOld),
          '--no-password',
        ],
        options: { env },
      });

      isRollBack.dbOld = true;

      // Rename the backup database (it will now be the production database)
      await $utils.runCommandSpawn({
        command: 'psql',
        args: ['-h', host, '-p', port, '-U', user, '-c', sqlRenameDatabase(dbRestore, db)],
        options: { env },
      });
      isRollBack.dbRestore = false;
      isRollBack.storageFilesDirOld = false;
      isRollBack.dbOld = false;
    } catch (error) {
      // Try to roll back changes

      if (isRollBack.dbRestore) {
        await $utils.runCommandSpawn({
          command: 'dropdb',
          args: ['-h', host, '-p', port, '-U', user, '--if-exists', '-f', dbRestore],
          options: { env },
        });
        console.log(`--> Rolled back database "${dbRestore}"`);
      }

      if (isRollBack.storageFilesDirOld) {
        for await (let item of movedItems) {
          let pathTo = `${this.storage.filesDir}/${item}`;
          await $utils.removeDir(pathTo);
          await fs.promises.rename(`${this.storage.filesDirOld}/${item}`, pathTo);
        }
        await $utils.removeDir(this.storage.filesDirOld);
        console.log(`--> Rolled back files in "${this.storage.filesDir}"`);
      }

      if (isRollBack.dbOld) {
        await $utils.runCommandSpawn({
          command: 'psql',
          args: ['-h', host, '-p', port, '-U', user, '-c', sqlRenameDatabase(dbOld, db)],
          options: { env },
        });
        console.log(`--> Rolled back database "${dbOld}"`);
      }
      throw error;
    }

    // Delete the old storageFiles + database
    await $utils.removeDir(this.storage.filesDirOld);

    // Delete the old database
    await $utils.runCommandSpawn({
      command: 'dropdb',
      args: ['-h', host, '-p', port, '-U', user, '--if-exists', '-f', dbOld],
      options: { env },
    });
    let restoreEnd = new Date().toISOString();
    console.log('--> Restore backup completed');
    return { restoreStart, restoreEnd };
  }

  // Write database file
  async writeDatabaseFile(dump, filePath) {
    let fnName = 'writeDatabaseFile';
    let writeStream = fs.createWriteStream(filePath);

    let stderr = '';
    dump.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // handlers events child_process
    let handlerChildProcess = new Promise((resolve, reject) => {
      dump.once('error', (error) => {
        reject(Object.assign(error, { source: `spawn (${fnName})`, filePath }));
      });
      dump.once('close', (code) => {
        console.warn({ filePath, warn: stderr });
        resolve(code);
      });
    });

    // handlers streams (add info)
    dump.stdout.once('error', (error) => {
      Object.assign(error, { source: `stdout (${fnName})`, filePath });
    });
    writeStream.once('error', (error) => {
      Object.assign(error, { source: `writeStream (${fnName})`, filePath });
    });

    let [_, code] = await Promise.all([
      stream.pipeline(dump.stdout, writeStream),
      handlerChildProcess,
    ]);

    // error
    if (code !== 0) {
      throw Object.assign(new Error('pg_dump failed'), {
        source: `pg_dump (${fnName})`,
        stderr,
        filePath,
      });
    }
    console.log(`--> File completed: "${filePath}"`);
  }

  // Copy files storage
  async copyFilesStorage(fromPath, toPath) {
    await fs.promises.cp(fromPath, toPath, {
      recursive: true,
      dereference: false,
      preserveTimestamps: true,
    });
    console.log(`--> Copied to "${toPath}"`);
  }
}

module.exports = Backup;
