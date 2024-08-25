import pinecone from "@pinecone-database/pinecone";
import fs from "fs";
import { OpenAIEmbeddings } from "openai";
import path from "path";

const pineconeClient = new pinecone.Client({ apiKey: process.env.PINECONE_API_KEY });
const pineconeIndex = pineconeClient.Index('your-index-name');

const openaiEmbeddings = new OpenAIEmbeddings('gpt-4-turbo-2024-04-09', { apiKey: process.env.OPENAI_API_KEY });

async function deleteOldVectors(repoName) {
  const deleteFilter = {
    metadata: {
      repoName: repoName
    }
  };

  await pineconeIndex.delete(deleteFilter);

  console.log(`Old vectors for repo ${repoName} have been deleted.`);
}

async function uploadToPinecone() {
  const mirrorRepoPath = path.join(process.cwd(), 'mirror_repo');
  const metadataFilePath = path.join(process.cwd(), 'repo_metadata.json');

  if (!fs.existsSync(mirrorRepoPath)) {
    throw new Error('The mirror_repo folder does not exist. Please generate it before running the upload.');
  }
  if (!fs.existsSync(metadataFilePath)) {
    throw new Error('The repo_metadata.json file does not exist. Please generate it before running the upload.');
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFilePath, 'utf8'));
  const repoName = metadata.repoName;

  await deleteOldVectors(repoName);

  const vectors = [];

  for (const file of metadata.metadata) {
    const filePath = path.join(mirrorRepoPath, file.filePath);

    const fileContent = fs.readFileSync(filePath, 'utf8');

    const embedding = await openaiEmbeddings.embedText(fileContent);

    vectors.push({
      id: `${file.filePath}/${file.fileName}`,
      values: embedding,
      metadata: {
        fileName: file.fileName,
        filePath: file.filePath,
        language: file.language,
        repoName: file.repoName,
        hierarchy: file.hierarchy.join(' > ')
      }
    });
  }

  await pineconeIndex.upsert({
    vectors: vectors
  });

  console.log('New data successfully uploaded to Pinecone');
}

uploadToPinecone().catch(err => {
  console.error('Error uploading to Pinecone:', err);
});
