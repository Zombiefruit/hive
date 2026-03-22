import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Code, Table, Text, Anchor, List } from "@mantine/core";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <Text size="sm" style={{ marginBottom: 4 }}>
            {children}
          </Text>
        ),
        a: ({ href, children }) => (
          <Anchor href={href ?? "#"} target="_blank" size="sm">
            {children}
          </Anchor>
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <Code block style={{ fontSize: "0.75rem", marginBlock: 8 }}>
                {String(children).replace(/\n$/, "")}
              </Code>
            );
          }
          return (
            <Code style={{ fontSize: "0.8em" }} {...props}>
              {children}
            </Code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        ul: ({ children }) => (
          <List size="sm" style={{ marginBlock: 4 }}>
            {children}
          </List>
        ),
        ol: ({ children }) => (
          <List type="ordered" size="sm" style={{ marginBlock: 4 }}>
            {children}
          </List>
        ),
        li: ({ children }) => <List.Item>{children}</List.Item>,
        table: ({ children }) => (
          <Table
            striped
            highlightOnHover
            withTableBorder
            withColumnBorders
            style={{ marginBlock: 8, fontSize: "0.8rem" }}
          >
            {children}
          </Table>
        ),
        thead: ({ children }) => <Table.Thead>{children}</Table.Thead>,
        tbody: ({ children }) => <Table.Tbody>{children}</Table.Tbody>,
        tr: ({ children }) => <Table.Tr>{children}</Table.Tr>,
        th: ({ children }) => <Table.Th>{children}</Table.Th>,
        td: ({ children }) => <Table.Td>{children}</Table.Td>,
        strong: ({ children }) => (
          <Text span fw={600} size="sm">
            {children}
          </Text>
        ),
        h1: ({ children }) => (
          <Text fw={700} size="lg" mt="xs">
            {children}
          </Text>
        ),
        h2: ({ children }) => (
          <Text fw={600} size="md" mt="xs">
            {children}
          </Text>
        ),
        h3: ({ children }) => (
          <Text fw={600} size="sm" mt="xs">
            {children}
          </Text>
        ),
        blockquote: ({ children }) => (
          <div
            style={{
              borderLeft: "3px solid var(--mantine-color-blue-5)",
              paddingLeft: 12,
              marginBlock: 8,
              opacity: 0.85,
            }}
          >
            {children}
          </div>
        ),
      }}
    />
  );
}
