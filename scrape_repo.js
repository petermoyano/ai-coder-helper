/**
 * AI Coder Helper - Repository Scraper
 * 
 * This script creates a mirror of a target repository and generates metadata
 * for AI processing. It respects .gitignore patterns and automatically
 * excludes node_modules and other specified directories.
 * 
 * Usage:
 *   node scrape_repo.js /path/to/target/repo
 * 
 * Example:
 *   If you run: node scrape_repo.js /home/user/projects/my-project
 * 
 * Output:
 *   - Creates a mirror of the repository at:
 *     /home/peter/chatbots/ai-coder-helper/my-project/mirror_repo
 *   - Generates metadata file at:
 *     /home/peter/chatbots/ai-coder-helper/my-project/repo_metadata.json
 *   - Each mirrored file includes metadata comments at the top
 * 
 * Note: This script will overwrite existing mirror_repo directory and metadata
 * file if they exist in the output location.
 */

import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

const scriptFileName = 'scrape_repo.js';
const metadataFileName = 'repo_metadata.json';

const BASE_OUTPUT_PATH = '/home/peter/chatbots/ai-coder-helper';

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
};

function getLanguage(filePath) {
  const ext = path.extname(filePath);
  const base = path.basename(filePath);
  return languageMap[ext] || languageMap[base] || 'Unknown';
}

async function loadGitignore(gitignorePath) {
  const ig = ignore();

  try {
    const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Failed to load .gitignore: ${err.message}`);
    }
    // Proceed if .gitignore doesn't exist
  }

  // Add custom ignored patterns
  ig.add([
    'mirror_repo',
    'node_modules',
    'public',
    scriptFileName,
    metadataFileName,
  ]);

  return ig;
}

async function collectFileMetadata(filePath, repoName) {
  try {
    const stats = await fs.promises.stat(filePath);
    const metadata = {
      fileName: path.basename(filePath),
      filePath: path.relative(process.cwd(), filePath),
      lastModified: stats.mtime,
      fileSize: stats.size,
      language: getLanguage(filePath),
      hierarchy: path
        .relative(process.cwd(), filePath)
        .split(path.sep)
        .slice(0, -1),
      repoName: repoName,
    };

    return metadata;
  } catch (err) {
    console.error(
      `Failed to collect metadata for file ${filePath}: ${err.message}`
    );
    // Decide whether to rethrow or handle the error
  }
}

async function copyFileWithMetadataComments(
  srcFilePath,
  destFilePath,
  metadata
) {
  try {
    const fileContent = await fs.promises.readFile(srcFilePath, 'utf-8');

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

    await fs.promises.writeFile(destFilePath, commentedContent, 'utf-8');
  } catch (err) {
    console.error(
      `Failed to copy file with metadata comments: ${err.message}`
    );
    // Decide whether to rethrow or handle the error
  }
}

async function createMirrorDirectoryStructure(
  srcDir,
  destDir,
  ig,
  repoName
) {
  try {
    await fs.promises.mkdir(destDir, { recursive: true });
    console.log(`Created directory: ${destDir}`);

    const files = await fs.promises.readdir(srcDir);

    for (const file of files) {
      const srcFilePath = path.join(srcDir, file);
      const destFilePath = path.join(destDir, file);
      const relativePath = path.relative(srcDir, srcFilePath);
      const stats = await fs.promises.stat(srcFilePath);

      if (
        (stats.isDirectory() && file.startsWith('.')) ||
        ig.ignores(relativePath)
      ) {
        console.log(`Ignored: ${relativePath}`);
        continue;
      }

      if (stats.isDirectory()) {
        await createMirrorDirectoryStructure(
          srcFilePath,
          destFilePath,
          ig,
          repoName
        );
      } else if (stats.isFile()) {
        const metadata = await collectFileMetadata(srcFilePath, repoName);
        await copyFileWithMetadataComments(
          srcFilePath,
          destFilePath,
          metadata
        );
      }
    }
  } catch (err) {
    console.error(
      `Failed to create mirror directory structure: ${err.message}`
    );
    // Decide whether to rethrow or handle the error
  }
}

async function collectCodebaseMetadata(dirPath, repoName) {
  const gitignorePath = path.join(dirPath, '.gitignore');
  const ig = await loadGitignore(gitignorePath);
  let allMetadata = [];
  let fileCount = 0;
  const directoryFileCounts = {};

  async function traverse(currentPath, depth = 0) {
    try {
      const files = await fs.promises.readdir(currentPath);

      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const relativePath = path.relative(dirPath, fullPath);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory() && file.startsWith('.')) {
          console.log(`Ignored hidden directory: ${relativePath}`);
          continue;
        }

        if (ig.ignores(relativePath)) {
          console.log(`Ignored: ${relativePath}`);
          continue;
        }

        if (stats.isDirectory()) {
          await traverse(fullPath, depth + 1);
        } else if (stats.isFile()) {
          const fileMetadata = await collectFileMetadata(fullPath, repoName);
          allMetadata.push(fileMetadata);
          fileCount++;

          const directory =
            depth === 0 ? 'root' : path.dirname(relativePath);
          directoryFileCounts[directory] =
            (directoryFileCounts[directory] || 0) + 1;
        }
      }
    } catch (err) {
      console.error(
        `Failed to traverse directory ${currentPath}: ${err.message}`
      );
      // Decide whether to rethrow or handle the error
    }
  }

  await traverse(dirPath);

  console.log(`Total files processed for metadata: ${fileCount}`);
  console.log('**************************************************');
  console.log('Files processed per directory:');
  for (const [directory, count] of Object.entries(directoryFileCounts)) {
    console.log(`${directory}: ${count}`);
  }
  console.log('**************************************************');

  return { repoName, metadata: allMetadata };
}

async function saveMetadataToFile(metadata) {
  try {
    await fs.promises.writeFile(
      METADATA_PATH,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
    console.log(`Metadata saved to ${METADATA_PATH}`);
  } catch (err) {
    console.error(`Failed to save metadata to file: ${err.message}`);
    // Decide whether to rethrow or handle the error
  }
}

async function runAiCoderHelper(targetRepoPath) {
  try {
    if (!targetRepoPath) {
      console.error('Please provide a target repository path');
      process.exit(1);
    }

    try {
      await fs.promises.access(targetRepoPath);
    } catch (err) {
      console.error(`Target repository path does not exist: ${targetRepoPath}`);
      process.exit(1);
    }

    const repoName = path.basename(targetRepoPath);
    const gitignorePath = path.join(targetRepoPath, '.gitignore');

    const REPO_OUTPUT_PATH = path.join(BASE_OUTPUT_PATH, repoName);
    const MIRROR_REPO_PATH = path.join(REPO_OUTPUT_PATH, 'mirror_repo');
    const METADATA_PATH = path.join(REPO_OUTPUT_PATH, metadataFileName);

    await fs.promises.mkdir(REPO_OUTPUT_PATH, { recursive: true });

    const ig = await loadGitignore(gitignorePath);

    try {
      await fs.promises.access(MIRROR_REPO_PATH);
      console.log('Mirror directory already exists. Deleting existing directory...');
      await fs.promises.rm(MIRROR_REPO_PATH, { recursive: true, force: true });
    } catch (err) {
      // Mirror directory does not exist, proceed
    }

    await fs.promises.mkdir(MIRROR_REPO_PATH, { recursive: true });

    const metadata = await collectCodebaseMetadata(targetRepoPath, repoName);
    await fs.promises.writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`Metadata saved to ${METADATA_PATH}`);

    await createMirrorDirectoryStructure(targetRepoPath, MIRROR_REPO_PATH, ig, repoName);
    console.log(`Mirror codebase created successfully in: ${MIRROR_REPO_PATH}`);
  } catch (err) {
    console.error(`Error in runAiCoderHelper: ${err.message}`);
    console.error(err.stack);
  }
}

(async () => {
  try {
    const targetRepoPath = process.argv[2];
    await runAiCoderHelper(targetRepoPath);
  } catch (err) {
    console.error(`Unhandled error: ${err.message}`);
    console.error(err.stack);
  }
})();
