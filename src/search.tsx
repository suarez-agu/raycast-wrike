import {
	ActionPanel,
	Action,
	List,
	showToast,
	Toast,
	Detail,
	getPreferenceValues,
} from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import fetch, { AbortError } from "node-fetch";
import { WrikeResponse, WrikeTask, WrikeUser, SearchState, Preferences, APIError } from "./types";
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { URLSearchParams } from "url";


export default function Command() {
  const { state, search } = useSearch();

  return (
    <List
      isLoading={state.isLoading}
      onSearchTextChange={search}
      searchBarPlaceholder="Search Wrike tasks..."
      throttle
    >
      <List.Section title="Results" subtitle={state.results.length + ""}>
        {state.results.map((searchResult) => (
          <SearchListItem key={searchResult.id} searchResult={searchResult} />
        ))}
      </List.Section>
    </List>
  );
}

function TaskDetail({ task }: {task: WrikeTask}) {
  const detailsMarkdown = `
  # ${task.title}

  ## Description
  ${NodeHtmlMarkdown.translate(task.description)}
  `

  return (
    <Detail
      markdown={detailsMarkdown}
      navigationTitle={task.title}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item text={task.status} color={"#3cb043"} />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Link
            title="Link"
            target={task.permalink}
            text="Open in Wrike"
        />
        </Detail.Metadata>
      }
      />
  )
}

function SearchListItem({ searchResult }: { searchResult: WrikeTask }) {
  return (
    <List.Item
      key={searchResult.id}
      title={searchResult.title}
      subtitle={searchResult.briefDescription}
      accessories={[{text: searchResult.status}]}
      actions={
        <ActionPanel>
          <Action.Push title="View task detail" target={<TaskDetail task={searchResult} />}/>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in Browser" url={searchResult.permalink} />
          </ActionPanel.Section>
          <ActionPanel.Section>
						<Action.CopyToClipboard
							title="Copy Title - Permalink"
							content={`${searchResult.title} - ${searchResult.permalink}`}
							shortcut={{ modifiers: ["cmd"], key: "," }}
						/>
            <Action.CopyToClipboard
              title="Copy Permalink"
              content={searchResult.permalink}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function useSearch() {
  const [state, setState] = useState<SearchState>({ results: [], isLoading: true });
  const cancelRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async function search(searchText: string) {
      cancelRef.current?.abort();
      cancelRef.current = new AbortController();
      setState((oldState) => ({
        ...oldState,
        isLoading: true,
      }));
      try {
        const results = await performSearch(searchText, cancelRef.current.signal);
        setState((oldState) => ({
          ...oldState,
          results: results,
          isLoading: false,
        }));
      }
			catch (error) {
        setState((oldState) => ({
          ...oldState,
          isLoading: false,
        }));

        if (error instanceof AbortError) {
          return;
        }

        console.error("search error", error);
        showToast({ style: Toast.Style.Failure, title: "Could not perform search", message: String(error) });
      }
    },
    [cancelRef, setState]
  );

  useEffect(() => {
    search("");
    return () => {
      cancelRef.current?.abort();
    };
  }, []);

  return {
    state: state,
    search: search,
  };
}

async function performSearch(searchText: string, signal: AbortSignal): Promise<WrikeTask[]> {
  const params = new URLSearchParams();
	const currentUser = await getCurrentUser(signal);

  params.append("fields", `[description]`)

	if(searchText.length == 0) {
		params.append("authors", `[${currentUser?.id}]`)
		params.append("status", "Active")
		params.append("sortField", 'UpdatedDate')
		params.append("sortOrder", 'Desc')
		params.append("limit", '100')
	} else {
		params.append("title", searchText)
		params.append("sortField", 'status')
		params.append("sortOrder", 'Asc')
	}

  const response = await wrikeGetRequest<WrikeTask>('tasks', params, signal);

  return response.data.map((result) => {
    return result;
  });
}

async function getUsersFromWrike(signal: AbortSignal): Promise<WrikeResponse<WrikeUser>> {
	const users = await wrikeGetRequest<WrikeUser>('contacts', new URLSearchParams(), signal);
	return users;
}

async function getCurrentUser(signal: AbortSignal) {
	const users = await getUsersFromWrike(signal);
	return users.data.find(user => user.me);
}

async function wrikeGetRequest<T>(endpoint: string, params: URLSearchParams, signal: AbortSignal): Promise<WrikeResponse<T>> {
	console.log(`Getting ${endpoint}`)
	const preferences = getPreferenceValues<Preferences>();
	const response = await fetch(`https://www.wrike.com/api/v4/${endpoint}?${params.toString()}`, {
		method: "get",
		headers: {
			Authorization: `bearer ${preferences.token}`
		},
		signal: signal,
	});

	const json = (await response.json()) as WrikeResponse<T> | APIError;
	if (!response.ok || "errorDescription" in json) {
		throw new Error("errorDescription" in json ? json.errorDescription : response.statusText);
	}

	return json;
}
