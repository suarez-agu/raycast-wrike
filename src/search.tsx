import {
	ActionPanel,
	Action,
	List,
	showToast,
	Toast,
	Detail,
} from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import { WrikeTask, SearchState } from "./types";
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { URLSearchParams } from "url";
import {getCurrentUser, getRequest, statusToColorMap} from "./wrike";
import { AbortError } from "node-fetch";


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
            <Detail.Metadata.TagList.Item text={task.status} color={statusToColorMap(task.status)} />
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

  const response = await getRequest<WrikeTask>('tasks', params, signal);

  return response.data.map((result) => {
    return result;
  });
}


