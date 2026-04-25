let { FILES__STORAGE_MOUNT_DIR, FILES__STORAGE, APP_DIR } = process.env;

let backupRootDir = '/app-backup';
let dbDir = `${backupRootDir}/database`;
let backupSshRootDir = '/app-backup-ssh';

module.exports = {
  reportErrorPath: `${APP_DIR}/error.json`,
  storage: {
    filesDir: FILES__STORAGE_MOUNT_DIR,
    filesDirOld: `${FILES__STORAGE_MOUNT_DIR}/files-old`,
  },
  backup: {
    rootDir: backupRootDir,
    storageFilesDir: `${backupRootDir}/${FILES__STORAGE}`,
    dbDir: `${backupRootDir}/database`,
    dbStructurePath: `${dbDir}/1.db-structure.sql`,
    dbDataPath: `${dbDir}/db-backup.dump`,
    dbTranslationsPath: `${dbDir}/3.translations-data.sql`,
    reportPath: `${backupRootDir}/report.json`,
  },
  backupSsh: {
    rootDir: backupSshRootDir,
    settingsPath: `${backupSshRootDir}/settings.json`,
    privateKeyPath: `${backupSshRootDir}/ssh_key`,
    publicKeyPath: `${backupSshRootDir}/ssh_key.pub`,
  },
};
