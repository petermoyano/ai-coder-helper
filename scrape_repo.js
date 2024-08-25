import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

const scriptFileName = 'scrape_repo.js';
const metadataFileName = 'repo_metadata.json';

const languageMap = {
  '.js': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TSX',
  '.jsx': 'JSX',
  '.py': 'Python',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.cpp': 'C++',
  '.c': 'C',
  '.cs': 'C#',
  '.php': 'PHP',
  '.html': 'HTML',
  '.css': 'CSS',
  '.json': 'JSON',
  '.txt': 'Text',
  '.md': 'Markdown',
  '.gitattributes': 'Git',
  '.prettierrc': 'JSON',
  'Pipfile': 'Python',
  'Pipfile.lock': 'Python',
  '.prettierrc': 'JSON',
};

function getLanguage(filePath) {
  const ext = path.extname(filePath);
  return languageMap[ext] || 'Unknown';
}

function loadGitignore(gitignorePath) {
  try {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const ig = ignore().add(gitignoreContent);

    ig.add('mirror_repo');
    ig.add('node_modules');
    ig.add(scriptFileName);
    ig.add(metadataFileName);

    return ig;
  } catch (err) {
    console.error(`Failed to load .gitignore: ${err.message}`);
    throw err;
  }
}

function collectFileMetadata(filePath, repoName) {
  try {
    const stats = fs.statSync(filePath);
    const metadata = {
      fileName: path.basename(filePath),
      filePath: path.relative(process.cwd(), filePath),
      lastModified: stats.mtime,
      fileSize: stats.size,
      language: getLanguage(filePath),
      hierarchy: path.relative(process.cwd(), filePath).split(path.sep).slice(0, -1),
      repoName: repoName,
    };

    return metadata;
  } catch (err) {
    console.error(`Failed to collect metadata for file ${filePath}: ${err.message}`);
    throw err;
  }
}

function createMirrorDirectoryStructure(srcDir, destDir, ig, repoName) {
  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
      console.log(`Created directory: ${destDir}`);
    }

    const files = fs.readdirSync(srcDir);

    files.forEach(file => {
      const srcFilePath = path.join(srcDir, file);
      const destFilePath = path.join(destDir, file);
      const relativePath = path.relative(srcDir, srcFilePath);
      const stats = fs.statSync(srcFilePath);

      if ((stats.isDirectory() && file.startsWith('.')) || ig.ignores(relativePath)) {
        console.log(`Ignored: ${relativePath}`);
        return;
      }

      if (stats.isDirectory()) {
        createMirrorDirectoryStructure(srcFilePath, destFilePath, ig, repoName);
      } else if (stats.isFile()) {
        const metadata = collectFileMetadata(srcFilePath, repoName);
        copyFileWithMetadataComments(srcFilePath, destFilePath, metadata);
      }
    });
  } catch (err) {
    console.error(`Failed to create mirror directory structure: ${err.message}`);
    throw err;
  }
}

function copyFileWithMetadataComments(srcFilePath, destFilePath, metadata) {
  try {
    const fileContent = fs.readFileSync(srcFilePath, 'utf-8');

    const metadataComment = `
/*
* Project Name: ${metadata.repoName}
* File Name: ${metadata.fileName}
* File Size: ${metadata.fileSize} bytes
* Last Modified: ${metadata.lastModified}
* Language: ${metadata.language}
* Hierarchy: ${metadata.hierarchy.join(' > ')}
* Start of file: ${metadata.filePath}
*/`;

    const commentedContent = `${metadataComment}\n${fileContent}\n/* End of file: ${metadata.filePath} */`;

    fs.writeFileSync(destFilePath, commentedContent, 'utf-8');
  } catch (err) {
    console.error(`Failed to copy file with metadata comments: ${err.message}`);
    throw err;
  }
}

function collectCodebaseMetadata(dirPath, repoName) {
  const gitignorePath = path.join(dirPath, '.gitignore');
  const ig = loadGitignore(gitignorePath);
  let allMetadata = [];
  let fileCount = 0;
  const directoryFileCounts = {};

  function traverse(currentPath, depth = 0) {
    try {
      const files = fs.readdirSync(currentPath);

      files.forEach(file => {
        const fullPath = path.join(currentPath, file);
        const relativePath = path.relative(dirPath, fullPath);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory() && file.startsWith('.')) {
          console.log(`Ignored hidden directory: ${relativePath}`);
          return;
        }

        if (ig.ignores(relativePath)) {
          console.log(`Ignored: ${relativePath}`);
          return;
        }

        if (stats.isDirectory()) {
          traverse(fullPath, depth + 1);
        } else if (stats.isFile()) {
          const fileMetadata = collectFileMetadata(fullPath, repoName);
          allMetadata.push(fileMetadata);
          fileCount++;

          const directory = depth === 0 ? 'root' : path.dirname(relativePath);
          directoryFileCounts[directory] = (directoryFileCounts[directory] || 0) + 1;
        }
      });
    } catch (err) {
      console.error(`Failed to traverse directory ${currentPath}: ${err.message}`);
      throw err;
    }
  }

  traverse(dirPath);

  console.log(`Total files processed for metadata: ${fileCount}`);
  console.log('**************************************************')
  console.log('Files processed per directory:');
  for (const [directory, count] of Object.entries(directoryFileCounts)) {
    console.log(`${directory}: ${count}`);
  }
  console.log('**************************************************')

  return { repoName, metadata: allMetadata };
}

function saveMetadataToFile(metadata, outputFileName) {
  try {
    const outputPath = path.join(process.cwd(), outputFileName);
    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`Metadata saved to ${outputPath}`);
  } catch (err) {
    console.error(`Failed to save metadata to file ${outputFileName}: ${err.message}`);
    throw err;
  }
}

function runAiCoderHelper() {
  try {
    const codebaseDir = process.cwd();
    const repoName = path.basename(codebaseDir);
    const mirrorDir = path.join(codebaseDir, 'mirror_repo');
    const gitignorePath = path.join(codebaseDir, '.gitignore');

    const ig = loadGitignore(gitignorePath);

    if (fs.existsSync(mirrorDir)) {
      console.log(`Mirror directory already exists. Deleting existing directory...`);
      fs.rmSync(mirrorDir, { recursive: true, force: true });
    }

    fs.mkdirSync(mirrorDir, { recursive: true });

    const metadata = collectCodebaseMetadata(codebaseDir, repoName);
    saveMetadataToFile(metadata, metadataFileName);

    createMirrorDirectoryStructure(codebaseDir, mirrorDir, ig, repoName);
    console.log(`Mirror codebase created successfully in: ${mirrorDir}`);
  } catch (err) {
    console.error(`Error in runAiCoderHelper: ${err.message}`);
    console.error(err.stack);
  }
}

try {
  runAiCoderHelper();
} catch (err) {
  console.error(`Unhandled error: ${err.message}`);
  console.error(err.stack);
}
