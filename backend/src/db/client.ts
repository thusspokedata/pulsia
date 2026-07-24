import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];

// La transacción que recibe el callback de `db.transaction`. NO es un `Db` (le falta `$client`),
// así que un repositorio que tenga que correr adentro y afuera de una transacción se tipa con
// `DbOrTx`.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
