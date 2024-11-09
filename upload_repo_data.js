import pinecone from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import fs from "fs";
import path from "path";
import 'dotenv/config';

const { Pinecone } = pinecone;
const PineconeClient = Pinecone;

async function loadDocuments() {
  console.log('Loading documents from mirror_repo...');
  const mirrorRepoPath = path.join(process.cwd(), 'mirror_repo');
  const metadataFilePath = path.join(process.cwd(), 'repo_metadata.json');

  if (!fs.existsSync(mirrorRepoPath)) {
    throw new Error('The mirror_repo folder does not exist. Please generate it before running the upload.');
  }
  if (!fs.existsSync(metadataFilePath)) {
    throw new Error('The repo_metadata.json file does not exist. Please generate it before running the upload.');
  }

  const metadataContent = fs.readFileSync(metadataFilePath, 'utf8');
  const metadata = JSON.parse(metadataContent);
  console.log(`Loaded metadata for ${metadata.metadata.length} files.`);

  const documents = [];

  for (const file of metadata.metadata) {
    const filePath = path.join(mirrorRepoPath, file.filePath);
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const docMetadata = {
      fileName: file.fileName,
      filePath: file.filePath,
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
  }

  console.log(`Prepared ${documents.length} documents for upload.`);
  return documents;
}

async function uploadToPinecone() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not set in environment variables.');
  }

  // Initialize Pinecone client without the environment property
  const pinecone = new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
  });

  // Get the index reference, which includes the environment information
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX);

  const documents = await loadDocuments();
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
  });

  console.log('Generating embeddings and uploading documents to Pinecone...');
  // Upload the documents to Pinecone via LangChain
  const vectorStore = await PineconeStore.fromDocuments(documents, embeddings, {
    pineconeIndex: pineconeIndex,
  });

  console.log('Data successfully uploaded to Pinecone.');

  // Check vector count
  const vectorCount = await pineconeIndex.describeIndexStats();
  console.log('Pinecone Index Stats:', vectorCount); // Log the full response
  console.log(`Current vector count in Pinecone: ${vectorCount?.totalRecordCount}`);
}

uploadToPinecone().catch(err => {
  console.error('Error uploading to Pinecone:', err);
});
