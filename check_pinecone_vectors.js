

const vectorCount = await pineconeIndex.describeIndexStats();
console.log(`Current vector count: ${vectorCount.totalVectorCount}`);
