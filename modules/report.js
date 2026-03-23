let crypto = require('node:crypto');
let fs = require('node:fs');
let stream = require('node:stream/promises');
let path = require('node:path');

class Report {
  constructor({ backup }) {
    for(let key in this.backup) {
      this.backup[key] = backup[key];
    }
  }

  backup = {  
    rootDir: '',
    dbDir: '',
    reportPath: '',
  }

  // Create report
  async createReport({ databaseStart, databaseEnd, storageFilesStart, storageFilesEnd, backupId }) {
    let reportStart = new Date().toISOString();
    let dbFilesPaths = await fs.promises.readdir(this.backup.dbDir);
    await this.getDirInfo(this.backup.rootDir);

    let data = {
      backupId,
      paths: {},
    };
    // database files info
    for await(let filePath of dbFilesPaths) {
      let fullFilePath = `${this.backup.dbDir}/${filePath}`;
      data.paths[fullFilePath] = await this.getFileInfo(fullFilePath);
    }

    // files storage info
    let dirList = await this.createDirList(this.backup.rootDir);
    for await(let dirPath of dirList) {
      data.paths[dirPath] = await this.getDirInfo(dirPath);
    }
    let reportEnd = new Date().toISOString();

    Object.assign(data, {
      database: {
        dateStart: databaseStart,
        dateEnd: databaseEnd,
      },
      storageFiles: {
        dateStart: storageFilesStart,
        dateEnd: storageFilesEnd,
      },
      report: {
        dateStart: reportStart,
        dateEnd: reportEnd,
      }
    });

    await fs.promises.writeFile(this.backup.reportPath, JSON.stringify(data, null, 2), 'utf8');
    console.log("--> Report completed");
    return data;
  }
  
  // Create report with error
  async createReportError({ error, reportPath }) {
    console.error(error);
    let data = { error: error.message, stack: error.stack, date: new Date().toISOString() };
    await fs.promises.writeFile(reportPath, JSON.stringify(data, null, 2), 'utf8');
    console.log("--> Report with error completed");
    return data;
  }

  // Get file info: hash + size
  async getFileInfo(filePath) {
    let fnName = 'getFileInfo';
    let stat = await fs.promises.stat(filePath);
    let hash = crypto.createHash('sha256');
    let fileStream = fs.createReadStream(filePath);
    try {
      await stream.pipeline(fileStream, hash);
      return { 
        sha256: hash.digest('hex'), 
        'size-bytes': stat.size,
        'size-mb': (stat.size / (1024 * 1000)).toFixed(2)
      };
    } catch (error) {
      Object.assign(error, { source: `${fnName} (${filePath})` });
      throw error;
    }
  }

  // Get info for a directory
  async getDirInfo(dirPath) {
    let countFiles = 0;
    let countDirs = 0;
    let countSimlink = 0;
    let sizeFiles = 0;
    let items = await fs.promises.opendir(dirPath);

    for await (let item of items) {
      if (item.isFile()) {
        let stat = await fs.promises.stat(`${dirPath}/${item.name}`);
        countFiles++;
        sizeFiles += stat.size;
      } else if (item.isDirectory()) {
        countDirs++;
      } else if (item.isSymbolicLink()) {
        countSimlink++;
      }
    }

    let info = {
      file: countFiles, 
      directory: countDirs, 
      symlink: countSimlink,
      'size-files-bytes': sizeFiles, 
      'size-files-mb': (sizeFiles / (1024 * 1000)).toFixed(2) 
    };

    return info;
  }

  // Create list directories
  async createDirList(rootPath) {
    let dirList = [rootPath];
    let stack = [rootPath];
    while (stack.length) {
      let dir = stack.pop();
      let items = await fs.promises.opendir(dir);
      for await (let item of items) {
        let fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          stack.push(fullPath);
          dirList.push(fullPath);
        }
      }
    }
    return dirList;
  }
}

module.exports = Report;
