let fs = require('node:fs');
let child_process = require('node:child_process');
let $utils = {
  // Check exist dir
  async isExistPath(curentPath) {
    try {
      await fs.promises.stat(curentPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  },

  // Remove file
  async removeFile(filePath) {
    let isExist = await this.isExistPath(filePath);
    if (!isExist) return;
    await fs.promises.unlink(filePath);
    console.log(`--> File removed "${filePath}"`);
  },

  // Create dir
  async createDir(dirPath) {
    let isExist = await this.isExistPath(dirPath);
    if (isExist) return;
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`--> Directory created "${dirPath}"`);
  },

  // Remove dir with all content
  async removeDir(dirPath) {
    let isExist = await this.isExistPath(dirPath);
    if (!isExist) return;
    await fs.promises.rm(dirPath, { recursive: true });
    console.log(`--> Directory removed "${dirPath}"`);
  },

  async runCommandSpawn({ command, args = [], options = {} }) {
    return new Promise((resolve, reject) => {
      let stderr = '';
      let result = child_process.spawn(command, args, {
        encoding: 'utf8',
        ...options,
      });

      // handlers streams (add info)
      result.stdout.once('error', (error) => {
        Object.assign(error, { command: `command (${command}), args (${args})` });
        reject(error);
      });

      result.once('error', (error) => {
        Object.assign(error, { command: `command (${command}), args (${args})` });
        reject(error);
      });

      result.once('close', (code) => {
        code === 0 ? resolve() : reject(new Error(stderr));
      });

      result.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  },
};

module.exports = { $utils };
