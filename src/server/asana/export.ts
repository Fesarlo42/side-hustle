/**
 * Reads the Side Hustle project from a JSON export instead of Asana's API.
 *
 * For people without an Asana developer token: Claude reads the project through
 * its Asana connector and writes this file (project, tasks, and each task's
 * stories, in the same shape the API returns). The server picks up a new export
 * within a few seconds.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { AsanaData } from './build'

export const EXPORT_FILE =
  process.env.SIDE_HUSTLE_ASANA_FILE ?? path.join(process.cwd(), 'data', 'asana-export.json')

export interface AsanaExport extends AsanaData {
  /** When the export was read from Asana (ISO 8601). */
  exportedAt: string
}

export class ExportReader {
  exportedAt?: number
  private cache?: { mtimeMs: number; data: AsanaData }

  constructor(private file: string) {}

  async read(): Promise<AsanaData> {
    const s = await stat(this.file).catch(() => null)
    if (!s) throw new Error(`there is no export at ${this.file} yet`)
    if (this.cache?.mtimeMs === s.mtimeMs) return this.cache.data
    const json = JSON.parse(await readFile(this.file, 'utf8')) as AsanaExport
    if (!json.project || !Array.isArray(json.tasks) || typeof json.stories !== 'object')
      throw new Error(`${path.basename(this.file)} isn’t an Asana export`)
    this.exportedAt = Date.parse(json.exportedAt) || s.mtimeMs
    const data: AsanaData = { project: json.project, tasks: json.tasks, stories: json.stories }
    this.cache = { mtimeMs: s.mtimeMs, data }
    return data
  }
}
