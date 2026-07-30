import mongoose from "mongoose";

export async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) return;
  await mongoose.connect(uri);
  console.log("mongodb connencted")
}
