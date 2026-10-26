import mongoose from 'mongoose';

// autoIndex / autoCreate désactivés : les index et validateurs sont créés par database/mongo/init/01-init.js
export async function connectDb(uri) {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
