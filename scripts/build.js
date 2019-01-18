const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const root = path.join(__dirname, '../');

async function getAllFiles(currentPath) {
  const fileNames = (await readdir(currentPath))
    .map(file => path.join(currentPath, file));
  const allFiles = await Promise.all(fileNames.map(file => stat(file)));

  const foldersStats = allFiles.filter(file => file.isDirectory());
  const foldersIndexes = foldersStats.map(file => allFiles.indexOf(file));

  const folders = fileNames.filter((name, index) => foldersIndexes.includes(index));
  const files = fileNames.filter(name => !folders.includes(name));

  return [
    ...files,
    ...(await Promise.all(folders.map(getAllFiles)))
      .reduce((acc, folder) => [...acc, ...folder], []),
  ];
}

async function clearOldContracts(outputPath) {
  if (fs.existsSync(outputPath)) {
    return Promise.all((await getAllFiles(outputPath))
      .map(contract => unlink(contract)));
  }
}

async function writeNewContracts(inputPath, outputPath) {
  if (!fs.existsSync(outputPath)) {
    await mkdir(outputPath);
  }

  const contracts = await getAllFiles(inputPath);

  return Promise.all(contracts.map((contract) => {
    const {
      contractName,
      abi,
      networks,
      updatedAt,
    } = require(contract);

    if (Object.keys(networks).length) {
      return writeFile(
        path.join(outputPath, path.basename(contract)),
        JSON.stringify({
          contractName,
          abi,
          networks,
          updatedAt,
        }, null, '  '),
        'utf8',
      );
    }

    return null;
  }));
}

async function run() {
  const inputIndex = process.argv.indexOf('--input');
  const outputIndex = process.argv.indexOf('--output');
  const inputDir = (inputIndex !== -1 && process.argv[inputIndex + 1]) || 'build_contracts';
  const outputDir = (outputIndex !== -1 && process.argv[outputIndex + 1]) || 'dist';
  const inputPath = path.join(root, inputDir);
  const outputPath = path.join(root, outputDir);

  if (process.argv.includes('--clear')) {
    await clearOldContracts(outputPath);
  }

  await writeNewContracts(inputPath, outputPath);
}

run();
