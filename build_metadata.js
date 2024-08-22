// The functionality present is this file is only meant for the propper build up and supervision of the codebase metadata.
// It's meant to be placed in the root of the codebase and run to generate the metadata JSON file.
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

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

// Function to load and parse the .gitignore file using the ignore library
function loadGitignore(gitignorePath) {
  try {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    return ignore().add(gitignoreContent);
  } catch (err) {
    console.error(`Failed to load .gitignore: ${err.message}`);
    throw err;
  }
}

function collectFileMetadata(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const metadata = {
      fileName: path.basename(filePath),
      filePath: path.relative(process.cwd(), filePath),
      lastModified: stats.mtime,
      fileSize: stats.size,
      language: getLanguage(filePath),
      hierarchy: path.relative(process.cwd(), filePath).split(path.sep).slice(0, -1),
    };

    return metadata;
  } catch (err) {
    console.error(`Failed to collect metadata for file ${filePath}: ${err.message}`);
    throw err;
  }
}

function collectCodebaseMetadata(dirPath) {
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

        // Skip directories that start with a dot
        if (stats.isDirectory() && file.startsWith('.')) {
          console.log(`Ignored hidden directory: ${relativePath}`);
          return;
        }

        // Use the ignore library to check if the file should be ignored
        if (ig.ignores(relativePath)) {
          console.log(`Ignored: ${relativePath}`);
          return;
        }

        if (stats.isDirectory()) {
          traverse(fullPath, depth + 1);
        } else if (stats.isFile()) {
          const fileMetadata = collectFileMetadata(fullPath);
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
  console.log('Files processed per directory:');
  for (const [directory, count] of Object.entries(directoryFileCounts)) {
    console.log(`${directory}: ${count}`);
  }

  return allMetadata;
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
    const metadata = collectCodebaseMetadata(codebaseDir);
    saveMetadataToFile(metadata, 'codebase_metadata.json');
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
