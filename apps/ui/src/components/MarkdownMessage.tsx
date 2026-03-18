import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;

          if (isInline) {
            return (
              <code
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '0.15em 0.4em',
                  borderRadius: '4px',
                  fontSize: '0.85em',
                  fontFamily:
                    "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', Menlo, Consolas, monospace",
                }}
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <SyntaxHighlighter
              language={match ? match[1] : 'text'}
              useInlineStyles={false}
              PreTag="div"
              style={{}}
              customStyle={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '14px 16px',
                borderRadius: '8px',
                fontSize: '0.84em',
                lineHeight: '1.6',
                overflow: 'auto',
                margin: '12px 0',
                border: '1px solid var(--border-subtle)',
              }}
              codeTagProps={{
                style: {
                  fontFamily:
                    "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', Menlo, Consolas, monospace",
                  color: 'var(--text-primary)',
                },
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          );
        },
        p({ children }) {
          return (
            <p style={{ margin: '0.75em 0', lineHeight: '1.7', letterSpacing: '0.01em' }}>
              {children}
            </p>
          );
        },
        ul({ children }) {
          return (
            <ul
              style={{
                margin: '0.6em 0',
                paddingLeft: '1.5em',
                lineHeight: '1.7',
              }}
            >
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol
              style={{
                margin: '0.6em 0',
                paddingLeft: '1.5em',
                lineHeight: '1.7',
              }}
            >
              {children}
            </ol>
          );
        },
        li({ children }) {
          return (
            <li
              style={{
                margin: '0.35em 0',
                paddingLeft: '0.25em',
              }}
            >
              {children}
            </li>
          );
        },
        h1({ children }) {
          return (
            <h1
              style={{
                fontSize: '1.35em',
                fontWeight: 700,
                margin: '1.25em 0 0.4em',
                lineHeight: '1.3',
                letterSpacing: '-0.01em',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.3em',
              }}
            >
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2
              style={{
                fontSize: '1.2em',
                fontWeight: 700,
                margin: '1.1em 0 0.35em',
                lineHeight: '1.3',
                letterSpacing: '-0.005em',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.25em',
              }}
            >
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3
              style={{
                fontSize: '1.08em',
                fontWeight: 700,
                margin: '1em 0 0.3em',
                lineHeight: '1.35',
              }}
            >
              {children}
            </h3>
          );
        },
        h4({ children }) {
          return (
            <h4
              style={{
                fontSize: '1em',
                fontWeight: 600,
                margin: '0.85em 0 0.25em',
                lineHeight: '1.4',
              }}
            >
              {children}
            </h4>
          );
        },
        strong({ children }) {
          return (
            <strong style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{children}</strong>
          );
        },
        em({ children }) {
          return <em style={{ fontStyle: 'italic' }}>{children}</em>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.borderBottomColor = 'var(--accent-primary)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.borderBottomColor = 'transparent';
              }}
            >
              {children}
            </a>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote
              style={{
                borderLeft: '3px solid var(--accent-primary)',
                paddingLeft: '14px',
                margin: '0.75em 0',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
              }}
            >
              {children}
            </blockquote>
          );
        },
        hr() {
          return (
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-secondary)',
                margin: '1.5em 0',
              }}
            />
          );
        },
        table({ children }) {
          return (
            <div
              style={{
                overflowX: 'auto',
                margin: '0.75em 0',
                borderRadius: '8px',
                border: '1px solid var(--border-secondary)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.9em',
                  lineHeight: '1.5',
                }}
              >
                {children}
              </table>
            </div>
          );
        },
        thead({ children }) {
          return (
            <thead
              style={{
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              {children}
            </thead>
          );
        },
        tbody({ children }) {
          return <tbody>{children}</tbody>;
        },
        tr({ children, ...props }) {
          const isOddRow =
            props.node && props.node.position && props.node.position.start.line % 2 === 1;
          return (
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: isOddRow ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                transition: 'background-color 0.1s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isOddRow
                  ? 'rgba(255, 255, 255, 0.02)'
                  : 'transparent';
              }}
            >
              {children}
            </tr>
          );
        },
        th({ children }) {
          return (
            <th
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 600,
                fontSize: '0.85em',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                borderBottom: '2px solid var(--border-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td
              style={{
                padding: '8px 12px',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
