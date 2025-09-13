export interface Folder {
  id: string
  name: string
  description?: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface File {
  text(): unknown
  id: string
  name: string
  description?: string
  folder_id: string
  user_id: string
  file_path?: string
  table_name?: string
  created_at: string
  updated_at: string
}

export interface CSVData {
  [key: string]: any
}
