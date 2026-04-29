import fs from 'fs';
import path from 'path';
import pool from './index';

function resolveSchemaPath(): string {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'src/db/schema.sql'),
    path.join(process.cwd(), 'dist/db/schema.sql'),
  ];

  const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    throw new Error(`schema.sql not found. Checked: ${candidates.join(', ')}`);
  }

  return schemaPath;
}

export async function applySchema(): Promise<void> {
  const schemaPath = resolveSchemaPath();
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
}

if (require.main === module) {
  applySchema()
    .then(async () => {
      console.log('Database schema applied successfully');
      await pool.end();
    })
    .catch(async (err) => {
      console.error('Failed to apply database schema:', err);
      await pool.end();
      process.exit(1);
    });
}
