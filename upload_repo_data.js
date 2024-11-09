/**
 * Upload Repository Data to Pinecone
 * 
 * This script uploads documents and metadata from a specified target folder to Pinecone.
 * The target folder should contain:
 * - A 'mirror_repo' folder with the files to upload.
 * - A 'repo_metadata.json' file containing metadata about the files.
 * 
 * Usage:
 *   node upload_repo_data.js target_folder_name
 * 
 * Example:
 *   node upload_repo_data.js scribnewsv2
 * 
 * Note: Ensure all necessary environment variables are set in your .env file.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import fs from "fs";
import path from "path";
import 'dotenv/config';

async function loadDocuments(targetFolder) {
  console.log(`\n[1/4] Loading documents from '${targetFolder}'...`);
  const basePath = '/home/peter/chatbots/ai-coder-helper';
  const targetPath = path.join(basePath, targetFolder);
  const mirrorRepoPath = path.join(targetPath, 'mirror_repo');
  const metadataFilePath = path.join(targetPath, 'repo_metadata.json');

  // Check if required files exist
  if (!fs.existsSync(mirrorRepoPath)) {
    throw new Error(`The mirror_repo folder does not exist in ${targetPath}. Please run scrape_repo.js first to generate it.`);
  }
  if (!fs.existsSync(metadataFilePath)) {
    throw new Error(`The repo_metadata.json file does not exist in ${targetPath}. Please run scrape_repo.js first to generate it.`);
  }

  const metadataContent = fs.readFileSync(metadataFilePath, 'utf8');
  const metadata = JSON.parse(metadataContent);
  console.log(`Loaded metadata for ${metadata.metadata.length} files.`);

  const documents = [];
  let processedFiles = 0;
  let skippedFiles = 0;

  for (const file of metadata.metadata) {
    // Remove any leading slash from filePath
    const normalizedFilePath = file.filePath.replace(/^\//, '');
    const filePath = path.join(mirrorRepoPath, normalizedFilePath);

    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}. Skipping this file.`);
        skippedFiles++;
        continue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');

      const docMetadata = {
        fileName: file.fileName,
        filePath: normalizedFilePath,
        lastModified: file.lastModified,
        fileSize: file.fileSize,
        language: file.language,
        repoName: file.repoName,
        hierarchy: file.hierarchy.join(' > '),
      };

      documents.push({
        pageContent: fileContent,
        metadata: docMetadata,
      });

      processedFiles++;

      // Log progress every 100 files
      if (processedFiles % 100 === 0) {
        console.log(`Processed ${processedFiles} files...`);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error.message);
      skippedFiles++;
    }
  }

  console.log(`\nProcessing Summary:`);
  console.log(`------------------`);
  console.log(`Total files in metadata: ${metadata.metadata.length}`);
  console.log(`Successfully processed: ${processedFiles}`);
  console.log(`Skipped files: ${skippedFiles}`);
  console.log(`Prepared ${documents.length} documents for upload.`);

  if (documents.length === 0) {
    throw new Error('No documents were successfully processed. Please check the mirror_repo folder structure and file paths.');
  }

  return documents;
}

async function uploadToPinecone() {
  console.log('\nStarting upload process to Pinecone...');
  const targetFolder = process.argv[2];

  if (!targetFolder) {
    throw new Error('Please provide a target folder name as a command-line argument.');
  }

  // Environment variables check
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables.');
  }
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set in environment variables.');
  }

  // Initialize Pinecone client
  console.log('\n[2/4] Initializing Pinecone client...');
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  // Get the index reference
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX);
  console.log('Pinecone client initialized.');

  const documents = await loadDocuments(targetFolder);

  console.log('\n[3/4] Initializing OpenAI Embeddings...');
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI Embeddings initialized.');

  console.log('\n[4/4] Generating embeddings and uploading documents to Pinecone...');
  // Upload the documents to Pinecone via LangChain
  const batchSize = 100; // Adjust based on your needs and Pinecone limitations

  try {
    await PineconeStore.fromDocuments(documents, embeddings, {
      pineconeIndex: pineconeIndex,
      namespace: targetFolder, // Use the target folder name as the namespace
      textKey: 'pageContent',
      batchSize: batchSize,
      verbose: true, // Enable verbose logging for progress
    });
    console.log('\nData successfully uploaded to Pinecone.');
  } catch (error) {
    console.error('Error during upload to Pinecone:', error);
    return; // Exit the function if there's an error
  }

  // Check vector count
  try {
    const indexStats = await pineconeIndex.describeIndexStats({
      describeIndexStatsRequest: {
        filter: { namespace: targetFolder },
      },
    });
    console.log('\nUpload Summary:');
    console.log('---------------');
    console.log(`Total files uploaded: ${documents.length}`);
    console.log(`Current vector count in Pinecone for namespace '${targetFolder}': ${indexStats.totalVectorCount}`);
    console.log('---------------');
    console.log('Upload process completed successfully!');
  } catch (error) {
    console.error('Error fetching Pinecone index stats:', error);
  }
}

uploadToPinecone().catch(err => {
  console.error('Error uploading to Pinecone:', err);
});
