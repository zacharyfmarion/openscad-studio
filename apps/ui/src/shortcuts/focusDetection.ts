const TEXT_INPUT_MARKER = 'data-shortcuts-text-input';

function isNativeTextControl(element: Element): boolean {
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type?.toLowerCase() ?? 'text';
    const nonTextTypes = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range'];
    return !nonTextTypes.includes(type);
  }

  return false;
}

function isContentEditable(element: Element): boolean {
  return (element as HTMLElement).isContentEditable === true;
}

export function isTextInputFocused(event?: KeyboardEvent): boolean {
  if (event && typeof event.composedPath === 'function') {
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) {
        continue;
      }

      if (isNativeTextControl(node)) return true;
      if (isContentEditable(node)) return true;
      if (node.getAttribute('role') === 'textbox') return true;
      if (node.hasAttribute(TEXT_INPUT_MARKER)) return true;
      if (node.classList.contains('monaco-editor')) return true;
    }
  }

  const activeElement = document.activeElement;
  if (!activeElement || activeElement === document.body) {
    return false;
  }

  if (isNativeTextControl(activeElement)) return true;
  if (isContentEditable(activeElement)) return true;
  if (activeElement.getAttribute('role') === 'textbox') return true;
  if (activeElement.hasAttribute(TEXT_INPUT_MARKER)) return true;
  if (activeElement.closest('.monaco-editor')) return true;

  return false;
}
