interface SearchSnippetProps {
  headline: string;
}

export function SearchSnippet({ headline }: SearchSnippetProps) {
  return (
    <p
      className="text-xs text-muted-foreground mt-0.5 line-clamp-2 search-highlight"
      dangerouslySetInnerHTML={{ __html: headline }}
    />
  );
}
