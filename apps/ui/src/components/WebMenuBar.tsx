import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eventBus } from '../platform';
import { getShortcutDisplay } from '../shortcuts/formatDisplay';
import './WebMenuBar.css';

type MenuActionItem = { type: 'action'; id: string; label: string; shortcut?: string };
type MenuSeparator = { type: 'separator' };
type MenuItemDef = MenuActionItem | MenuSeparator;
type MenuDef = { label: string; items: MenuItemDef[] };

function getRenderShortcutLabel(): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return isMac ? '\u2318\u21B5' : 'Ctrl+Enter';
}

function getMenuBarDef(): MenuDef[] {
  return [
    {
      label: 'File',
      items: [
        {
          type: 'action',
          id: 'file.new',
          label: 'New File',
          shortcut: getShortcutDisplay('file.new'),
        },
        {
          type: 'action',
          id: 'file.open',
          label: 'Open File...',
          shortcut: getShortcutDisplay('file.open'),
        },
        { type: 'action', id: 'file.openProject', label: 'Open Folder...' },
        { type: 'separator' },
        {
          type: 'action',
          id: 'file.save',
          label: 'Save',
          shortcut: getShortcutDisplay('file.save'),
        },
        {
          type: 'action',
          id: 'file.saveAs',
          label: 'Save As...',
          shortcut: getShortcutDisplay('file.saveAs'),
        },
        {
          type: 'action',
          id: 'file.saveAll',
          label: 'Save All',
          shortcut: getShortcutDisplay('file.saveAll'),
        },
        { type: 'separator' },
        { type: 'action', id: 'file.export', label: 'Export...' },
        { type: 'separator' },
        {
          type: 'action',
          id: 'file.settings',
          label: 'Settings',
          shortcut: getShortcutDisplay('file.settings'),
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          type: 'action',
          id: 'edit.undo',
          label: 'Undo',
          shortcut: getShortcutDisplay('edit.undo'),
        },
        {
          type: 'action',
          id: 'edit.redo',
          label: 'Redo',
          shortcut: getShortcutDisplay('edit.redo'),
        },
        { type: 'separator' },
        { type: 'action', id: 'edit.render', label: 'Render', shortcut: getRenderShortcutLabel() },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          type: 'action',
          id: 'help.shortcuts',
          label: 'Keyboard Shortcuts',
          shortcut: getShortcutDisplay('help.shortcuts'),
        },
        { type: 'separator' },
        { type: 'action', id: 'help.about', label: 'About OpenSCAD Studio' },
      ],
    },
  ];
}

function MenuDropdown({
  items,
  onAction,
  onClose,
}: {
  items: MenuItemDef[];
  onAction: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="web-menubar__dropdown">
      {items.map((item, idx) => {
        if (item.type === 'separator') {
          return (
            <div
              key={`sep-${item.type}-after-${idx > 0 ? (items[idx - 1] as MenuActionItem).id : 'start'}`}
              className="web-menubar__separator"
            />
          );
        }
        return (
          // eslint-disable-next-line no-restricted-syntax -- WebMenuBar uses CSS-class-based styling (web-menubar__item) defined in its own stylesheet; migrating to <Button> would break those styles
          <button
            key={item.id}
            type="button"
            className="web-menubar__item"
            onClick={() => {
              onAction(item.id);
              onClose();
            }}
          >
            <span className="web-menubar__item-label">{item.label}</span>
            {item.shortcut && <span className="web-menubar__item-shortcut">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface WebMenuBarProps {
  onExport: () => void;
  onShare?: () => void;
  onShowShortcuts: () => void;
  onShowAbout: () => void;
  hasMultipleFiles?: boolean;
}

export function WebMenuBar({
  onExport,
  onShare,
  onShowShortcuts,
  onShowAbout,
  hasMultipleFiles,
}: WebMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const menuDef = useMemo(() => {
    const nextMenuDef = getMenuBarDef();
    // Insert "Save Project (.zip)..." after "Save All" when there are multiple files
    if (hasMultipleFiles) {
      const fileMenu = nextMenuDef[0]?.items;
      if (fileMenu) {
        const saveAllIdx = fileMenu.findIndex(
          (item) => item.type === 'action' && item.id === 'file.saveAll'
        );
        if (saveAllIdx >= 0) {
          fileMenu.splice(saveAllIdx + 1, 0, {
            type: 'action',
            id: 'file.saveProject',
            label: 'Save Project (.zip)...',
          });
        }
      }
    }
    if (onShare) {
      const exportIdx = nextMenuDef[0]?.items.findIndex(
        (item) => item.type === 'action' && item.id === 'file.export'
      );
      if (exportIdx !== undefined && exportIdx >= 0) {
        nextMenuDef[0]?.items.splice(exportIdx + 1, 0, {
          type: 'action',
          id: 'file.share',
          label: 'Share...',
        });
      }
    }
    return nextMenuDef;
  }, [onShare, hasMultipleFiles]);

  const handleClose = useCallback(() => {
    setOpenMenu(null);
  }, []);

  const handleAction = useCallback(
    (id: string) => {
      switch (id) {
        case 'file.new':
          eventBus.emit('menu:file:new');
          break;
        case 'file.open':
          eventBus.emit('menu:file:open');
          break;
        case 'file.save':
          eventBus.emit('menu:file:save');
          break;
        case 'file.saveAs':
          eventBus.emit('menu:file:save_as');
          break;
        case 'file.saveAll':
          eventBus.emit('menu:file:save_all');
          break;
        case 'file.export':
          onExport();
          break;
        case 'file.saveProject':
          eventBus.emit('menu:file:save_project');
          break;
        case 'file.openProject':
          eventBus.emit('menu:file:open_project');
          break;
        case 'file.share':
          onShare?.();
          break;
        case 'file.settings':
          eventBus.emit('menu:file:settings');
          break;
        case 'edit.undo':
          eventBus.emit('menu:edit:undo');
          break;
        case 'edit.redo':
          eventBus.emit('menu:edit:redo');
          break;
        case 'edit.render':
          eventBus.emit('render-requested');
          break;
        case 'help.shortcuts':
          onShowShortcuts();
          break;
        case 'help.about':
          onShowAbout();
          break;
      }
    },
    [onExport, onShare, onShowAbout, onShowShortcuts]
  );

  useEffect(() => {
    if (openMenu === null) return;

    const onClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [openMenu]);

  return (
    <div className="web-menubar" ref={barRef}>
      <div className="web-menubar__menus">
        {menuDef.map((menu, i) => (
          <div key={menu.label} className="web-menubar__menu-wrapper">
            {/* eslint-disable-next-line no-restricted-syntax -- web-menubar__trigger is a CSS-class-based menu trigger with active class toggling; migrating to <Button> would conflict with the menubar stylesheet */}
            <button
              type="button"
              className={`web-menubar__trigger ${openMenu === i ? 'web-menubar__trigger--active' : ''}`}
              onClick={() => setOpenMenu(openMenu === i ? null : i)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(i);
              }}
            >
              {menu.label}
            </button>
            {openMenu === i && (
              <MenuDropdown items={menu.items} onAction={handleAction} onClose={handleClose} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
