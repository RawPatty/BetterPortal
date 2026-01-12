<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { DiffResult, PropertyDiff, RoleAssignment } from '../../shared/types';
  import { formatValue, getDiffSummary } from './diff-calculator';

  export let diffResult: DiffResult;
  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();

  let activeTab: 'properties' | 'iam' = 'properties';

  function close() {
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      close();
    }
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  function getDiffTypeClass(type: PropertyDiff['type']): string {
    switch (type) {
      case 'added': return 'bp-diff--added';
      case 'removed': return 'bp-diff--removed';
      case 'changed': return 'bp-diff--changed';
      default: return '';
    }
  }

  $: summary = getDiffSummary(diffResult);
  $: hasPropertyChanges = diffResult.armDiff.length > 0;
  $: hasIamChanges = diffResult.iamDiff.added.length > 0 || diffResult.iamDiff.removed.length > 0;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="bp-diff-modal" on:click={handleBackdropClick}>
    <div class="bp-diff-panel" role="dialog" aria-modal="true" aria-label="Resource Diff">
      <header class="bp-diff-header">
        <h2>Resource Diff</h2>
        <button class="bp-diff-close" on:click={close} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <div class="bp-diff-meta">
        <div class="bp-diff-snapshot">
          <span class="bp-diff-label">Before:</span>
          <span class="bp-diff-value">{diffResult.snapshotA.label}</span>
          <span class="bp-diff-time">{formatTimestamp(diffResult.snapshotA.capturedAt)}</span>
        </div>
        <div class="bp-diff-snapshot">
          <span class="bp-diff-label">After:</span>
          <span class="bp-diff-value">{diffResult.snapshotB.label}</span>
          <span class="bp-diff-time">{formatTimestamp(diffResult.snapshotB.capturedAt)}</span>
        </div>
        <div class="bp-diff-summary">{summary}</div>
      </div>

      <div class="bp-diff-tabs">
        <button
          class="bp-diff-tab"
          class:bp-diff-tab--active={activeTab === 'properties'}
          on:click={() => activeTab = 'properties'}
        >
          Properties
          {#if hasPropertyChanges}
            <span class="bp-diff-badge">{diffResult.armDiff.length}</span>
          {/if}
        </button>
        <button
          class="bp-diff-tab"
          class:bp-diff-tab--active={activeTab === 'iam'}
          on:click={() => activeTab = 'iam'}
        >
          IAM
          {#if hasIamChanges}
            <span class="bp-diff-badge">{diffResult.iamDiff.added.length + diffResult.iamDiff.removed.length}</span>
          {/if}
        </button>
      </div>

      <div class="bp-diff-content">
        {#if activeTab === 'properties'}
          {#if diffResult.armDiff.length === 0}
            <div class="bp-diff-empty">No property changes detected</div>
          {:else}
            <div class="bp-diff-list">
              {#each diffResult.armDiff as diff}
                <div class="bp-diff-item {getDiffTypeClass(diff.type)}">
                  <div class="bp-diff-path">{diff.path}</div>
                  <div class="bp-diff-values">
                    {#if diff.type === 'added'}
                      <div class="bp-diff-value bp-diff-value--new">
                        <span class="bp-diff-prefix">+</span>
                        <pre>{formatValue(diff.newValue)}</pre>
                      </div>
                    {:else if diff.type === 'removed'}
                      <div class="bp-diff-value bp-diff-value--old">
                        <span class="bp-diff-prefix">-</span>
                        <pre>{formatValue(diff.oldValue)}</pre>
                      </div>
                    {:else}
                      <div class="bp-diff-value bp-diff-value--old">
                        <span class="bp-diff-prefix">-</span>
                        <pre>{formatValue(diff.oldValue)}</pre>
                      </div>
                      <div class="bp-diff-value bp-diff-value--new">
                        <span class="bp-diff-prefix">+</span>
                        <pre>{formatValue(diff.newValue)}</pre>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="bp-diff-iam">
            {#if !hasIamChanges}
              <div class="bp-diff-empty">No IAM changes detected</div>
            {:else}
              {#if diffResult.iamDiff.added.length > 0}
                <div class="bp-diff-iam-section">
                  <h4 class="bp-diff-iam-title bp-diff--added">Added Roles ({diffResult.iamDiff.added.length})</h4>
                  <table class="bp-diff-iam-table">
                    <thead>
                      <tr>
                        <th>Principal</th>
                        <th>Role</th>
                        <th>Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each diffResult.iamDiff.added as assignment}
                        <tr class="bp-diff-iam-row bp-diff--added">
                          <td>{assignment.principalName}</td>
                          <td>{assignment.roleName}</td>
                          <td class="bp-diff-iam-scope">{assignment.scope}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}

              {#if diffResult.iamDiff.removed.length > 0}
                <div class="bp-diff-iam-section">
                  <h4 class="bp-diff-iam-title bp-diff--removed">Removed Roles ({diffResult.iamDiff.removed.length})</h4>
                  <table class="bp-diff-iam-table">
                    <thead>
                      <tr>
                        <th>Principal</th>
                        <th>Role</th>
                        <th>Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each diffResult.iamDiff.removed as assignment}
                        <tr class="bp-diff-iam-row bp-diff--removed">
                          <td>{assignment.principalName}</td>
                          <td>{assignment.roleName}</td>
                          <td class="bp-diff-iam-scope">{assignment.scope}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}

              {#if diffResult.iamDiff.unchanged > 0}
                <div class="bp-diff-iam-unchanged">
                  {diffResult.iamDiff.unchanged} role assignment{diffResult.iamDiff.unchanged > 1 ? 's' : ''} unchanged
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>

      <footer class="bp-diff-footer">
        <button class="bp-diff-btn" on:click={close}>Close</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .bp-diff-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000000;
  }

  .bp-diff-panel {
    width: 800px;
    max-width: 95vw;
    max-height: 85vh;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bp-diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e1e1e1;
  }

  .bp-diff-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #323130;
  }

  .bp-diff-close {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #666;
    border-radius: 4px;
  }

  .bp-diff-close:hover {
    background: #f0f0f0;
    color: #323130;
  }

  .bp-diff-meta {
    padding: 12px 20px;
    background: #f8f8f8;
    border-bottom: 1px solid #e1e1e1;
    font-size: 13px;
  }

  .bp-diff-snapshot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .bp-diff-label {
    font-weight: 600;
    color: #666;
    width: 50px;
  }

  .bp-diff-value {
    color: #323130;
  }

  .bp-diff-time {
    color: #999;
    font-size: 12px;
  }

  .bp-diff-summary {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #e1e1e1;
    font-weight: 500;
    color: #0078d4;
  }

  .bp-diff-tabs {
    display: flex;
    padding: 0 20px;
    border-bottom: 1px solid #e1e1e1;
  }

  .bp-diff-tab {
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 14px;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bp-diff-tab:hover {
    color: #323130;
  }

  .bp-diff-tab--active {
    color: #0078d4;
    border-bottom-color: #0078d4;
  }

  .bp-diff-badge {
    background: #0078d4;
    color: #fff;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 10px;
  }

  .bp-diff-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .bp-diff-empty {
    text-align: center;
    padding: 40px 20px;
    color: #666;
  }

  .bp-diff-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bp-diff-item {
    border: 1px solid #e1e1e1;
    border-radius: 6px;
    overflow: hidden;
  }

  .bp-diff-path {
    padding: 8px 12px;
    background: #f5f5f5;
    font-family: monospace;
    font-size: 12px;
    color: #323130;
    border-bottom: 1px solid #e1e1e1;
  }

  .bp-diff-values {
    padding: 8px 12px;
  }

  .bp-diff-value {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 0;
  }

  .bp-diff-value pre {
    margin: 0;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .bp-diff-prefix {
    font-family: monospace;
    font-weight: bold;
    width: 16px;
    flex-shrink: 0;
  }

  .bp-diff-value--old {
    color: #d13438;
  }

  .bp-diff-value--old .bp-diff-prefix {
    color: #d13438;
  }

  .bp-diff-value--new {
    color: #107c10;
  }

  .bp-diff-value--new .bp-diff-prefix {
    color: #107c10;
  }

  .bp-diff--added {
    border-left: 3px solid #107c10;
  }

  .bp-diff--removed {
    border-left: 3px solid #d13438;
  }

  .bp-diff--changed {
    border-left: 3px solid #ffaa44;
  }

  .bp-diff-iam-section {
    margin-bottom: 20px;
  }

  .bp-diff-iam-title {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    padding-left: 8px;
  }

  .bp-diff-iam-title.bp-diff--added {
    color: #107c10;
  }

  .bp-diff-iam-title.bp-diff--removed {
    color: #d13438;
  }

  .bp-diff-iam-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .bp-diff-iam-table th {
    text-align: left;
    padding: 8px 12px;
    background: #f5f5f5;
    border: 1px solid #e1e1e1;
    font-weight: 600;
    color: #666;
  }

  .bp-diff-iam-table td {
    padding: 8px 12px;
    border: 1px solid #e1e1e1;
  }

  .bp-diff-iam-row.bp-diff--added td {
    background: #f0fff0;
  }

  .bp-diff-iam-row.bp-diff--removed td {
    background: #fff0f0;
  }

  .bp-diff-iam-scope {
    font-size: 11px;
    color: #666;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bp-diff-iam-unchanged {
    font-size: 13px;
    color: #666;
    font-style: italic;
  }

  .bp-diff-footer {
    padding: 12px 20px;
    border-top: 1px solid #e1e1e1;
    display: flex;
    justify-content: flex-end;
  }

  .bp-diff-btn {
    padding: 8px 16px;
    background: #0078d4;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .bp-diff-btn:hover {
    background: #106ebe;
  }
</style>
