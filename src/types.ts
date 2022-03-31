export interface WrikeTaskResponse {
  kind: string,
  data: WrikeTask[]
}
  
export interface WrikeTask {
  id: string,
  title: string,
  description: string,
  briefDescription: string,
  status: string,
  permalink: string
}

export interface SearchState {
  results: WrikeTask[];
  isLoading: boolean;
}

export interface Preferences {
  token: string
}