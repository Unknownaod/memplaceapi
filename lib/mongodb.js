import { MongoClient } from "mongodb";

let client;
let db;


export async function getDb() {

  const uri =
    process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not configured."
    );
  }


  if (!client) {

    client =
      new MongoClient(uri);

    await client.connect();
  }


  if (!db) {

    db =
      client.db(
        process.env.MONGODB_DB ||
        "middle_eastern_mixing"
      );
  }

  return db;
}
