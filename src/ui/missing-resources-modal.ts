/********************************* missing-resources-modal.ts ******************
 *
 * Purpose: Ask the user to provide the binaries for every external resource
 *   reference an imported `.md` file points at but the resource mapping
 *   doesn't yet know about (SPEC §6.5).
 * How: A single overlay modal lists the unresolved paths, exposes a multi-
 *   file picker, and matches the picked files against the missing paths by
 *   basename (last path segment). Resolved paths show a check + the source
 *   filename; still-missing paths stay marked. The user can pick again to
 *   add more files. On "Continuer", every resolved entry is written to the
 *   mapping via `addResource` and the promise resolves; on "Annuler",
 *   the promise rejects with a cancel error.
 *
 *******************************************************************************/

import { addResource } from '../resource-mapping';

const OVERLAY_ID = 'missing-resources-overlay';

/** Reported back to the caller; `resolved` is what got written to the mapping. */
export interface MissingResourcesOutcome {
  resolved: number;
  unresolved: number;
}

/** Caller rejects the promise with this symbol when the user cancels. */
export class ImportCancelled extends Error {
  constructor() {
    super('Import cancelled by user');
    this.name = 'ImportCancelled';
  }
}

/**
 * Purpose: Drive the modal; resolve once the user clicks Continuer (all
 *   matched paths persisted) or reject on Annuler.
 * How: Build the overlay DOM, wire a multi-file picker that updates an
 *   internal `resolved: Map<path, File>` and re-renders the status list.
 *   When the user accepts, walk the map and call `addResource(path, file)`
 *   sequentially (cheap — SHA-256 of a few image blobs).
 */
export async function promptForMissingResources(
  missingPaths: string[],
): Promise<MissingResourcesOutcome> {
  if (missingPaths.length === 0) return { resolved: 0, unresolved: 0 };
  // Single instance: dismiss any stale overlay.
  document.getElementById(OVERLAY_ID)?.remove();

  return new Promise<MissingResourcesOutcome>((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'missing-resources-overlay';

    const panel = document.createElement('div');
    panel.className = 'missing-resources-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute(
      'aria-label',
      'Ressources externes manquantes',
    );

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Ressources externes manquantes';
    const intro = document.createElement('p');
    intro.className = 'intro';
    intro.textContent =
      `Le document importé fait référence à ${missingPaths.length} ressource(s) ` +
      `que markpage ne connaît pas encore. Sélectionnez les fichiers ` +
      `correspondants (le matching se fait par nom de fichier). Les ressources ` +
      `non fournies resteront non résolues dans le document.`;
    header.append(title, intro);

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = 'image/*';
    picker.style.display = 'none';

    const pickButton = document.createElement('button');
    pickButton.type = 'button';
    pickButton.className = 'btn-primary';
    pickButton.textContent = 'Sélectionner les fichiers…';
    pickButton.addEventListener('click', () => picker.click());

    const list = document.createElement('ul');
    list.className = 'missing-list';
    // `resolved` is the source of truth: path → File.
    const resolved = new Map<string, File>();

    const renderList = (): void => {
      list.innerHTML = '';
      for (const path of missingPaths) {
        const item = document.createElement('li');
        const file = resolved.get(path);
        const status = document.createElement('span');
        status.className = file ? 'status status-ok' : 'status status-missing';
        status.textContent = file ? '✓' : '○';
        const pathLabel = document.createElement('code');
        pathLabel.textContent = path;
        const fileLabel = document.createElement('span');
        fileLabel.className = 'file-label';
        fileLabel.textContent = file ? `← ${file.name}` : '';
        item.append(status, pathLabel, fileLabel);
        list.appendChild(item);
      }
    };
    renderList();

    picker.addEventListener('change', () => {
      const files = picker.files ? [...picker.files] : [];
      // Match by basename. If multiple missing paths share the same
      // basename, all get the same blob.
      const byBasename = new Map<string, File>();
      for (const f of files) byBasename.set(f.name, f);
      for (const path of missingPaths) {
        const basename = path.split('/').pop() ?? path;
        const f = byBasename.get(basename);
        if (f) resolved.set(path, f);
      }
      // Reset the picker so the user can pick a different set on the next
      // click without browser-cached state.
      picker.value = '';
      renderList();
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn-secondary';
    cancelButton.textContent = 'Annuler l\'import';

    const continueButton = document.createElement('button');
    continueButton.type = 'button';
    continueButton.className = 'btn-primary';
    continueButton.textContent = 'Continuer l\'import';

    actions.append(cancelButton, continueButton);

    panel.append(header, pickButton, list, actions, picker);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const cleanup = (): void => {
      overlay.remove();
    };

    const onCancel = (): void => {
      cleanup();
      reject(new ImportCancelled());
    };

    const onContinue = async (): Promise<void> => {
      continueButton.disabled = true;
      try {
        for (const [path, file] of resolved) {
          // eslint-disable-next-line no-await-in-loop
          await addResource(path, file);
        }
        cleanup();
        resolve({
          resolved: resolved.size,
          unresolved: missingPaths.length - resolved.size,
        });
      } catch (err) {
        continueButton.disabled = false;
        console.error('Failed to persist resources', err);
        globalThis.alert(
          `Impossible d'enregistrer les ressources : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    cancelButton.addEventListener('click', onCancel);
    continueButton.addEventListener('click', () => void onContinue());

    // Esc cancels.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
  });
}
