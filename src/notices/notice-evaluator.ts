import { type NoticeLevel, NoticeShow, NoticeStage, ResourceOperation } from '@codifycli/schemas';
import { stripVTControlCharacters } from 'node:util';

import type { ApplyResult } from '../entities/apply-result.js';
import type { ResourceOrigin } from '../entities/resource-config.js';

import { type NoticeConfig } from '../entities/notice-config.js';
import { type Project } from '../entities/project.js';

/** A notice to show. Built from a NoticeConfig once it is decided that it is shown. */
export type Notice = {
  title?: string;
  message: string;
  level: NoticeLevel;
  // The source of the template the notice comes from. Undefined for the config itself.
  template?: string;
}

// Control characters other than new lines and tabs (a template could move the cursor or clear the screen)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u{0}-\u{8}\u{B}-\u{1F}\u{7F}-\u{9F}]/gu;

/**
 * Decides which notices are shown.
 *
 * Every notice is about some resources: the resources of its dependsOn, or else the resources of the template it is
 * declared in (including nested templates), or else every resource when it is declared in the config itself.
 *   - stage plan: shown with the plan.
 *   - stage apply, show onChange: shown after the apply if one of its resources was changed and none of them failed or
 *     was skipped.
 *   - stage apply, show always: also shown when nothing needed to change (but not if one of its resources failed).
 * A notice whose dependsOn only points to resources that don't apply here (os, distro or when) is never shown.
 */
export const NoticeEvaluator = {
  /**
   * Resolves the resources of every notice. Must run once the resources are final (after the os/distro filters, the
   * template merge and the xcode-tools injection). Throws for dependsOn references that don't exist.
   */
  resolve(project: Project): Map<NoticeConfig, string[]> {
    const result = new Map<NoticeConfig, string[]>();

    for (const notice of project.noticeConfigs) {
      if (notice.dependsOn.length > 0) {
        const ids = notice.dependsOn.flatMap((ref) => {
          const matches = project.resolveNoticeReference(ref);
          if (matches === null) {
            throw new Error(`Notice "${notice.title ?? notice.id}": dependsOn reference "${ref}" was not found`);
          }

          return matches;
        });

        result.set(notice, [...new Set(ids)]);
        continue;
      }

      result.set(notice, project.resourceConfigs
        .filter((r) => notice.origins.some((n) => r.origins.some((o) => isWithin(o, n))))
        .map((r) => r.id));
    }

    return result;
  },

  forPlan(project: Project): Notice[] {
    const resources = NoticeEvaluator.resolve(project);
    return project.noticeConfigs
      .filter((n) => n.stage === NoticeStage.PLAN && isAboutThisMachine(n, resources.get(n)!))
      .map((n) => toNotice(n));
  },

  /**
   * The notices to show after the apply.
   * @param project the project that was applied
   * @param result the result of the apply. Undefined when nothing needed to change.
   */
  forApply(project: Project, result?: ApplyResult): Notice[] {
    const resources = NoticeEvaluator.resolve(project);
    const changed = new Set(result?.entries
      .filter((e) => e.status === 'success' && e.operation !== ResourceOperation.NOOP)
      .map((e) => e.id));
    const notApplied = new Set(result?.entries.filter((e) => e.status !== 'success').map((e) => e.id));

    return project.noticeConfigs
      .filter((notice) => {
        const ids = resources.get(notice)!;
        if (notice.stage !== NoticeStage.APPLY || !isAboutThisMachine(notice, ids) || ids.some((id) => notApplied.has(id))) {
          return false;
        }

        if (notice.show === NoticeShow.ALWAYS) {
          return true;
        }

        // A notice that isn't about any resource (ex: a template that only has notices) is shown when anything was applied
        return ids.length === 0 ? result !== undefined : ids.some((id) => changed.has(id));
      })
      .map((n) => toNotice(n));
  },
};

// A notice with a dependsOn that only points to resources that don't apply here is not about this machine
function isAboutThisMachine(notice: NoticeConfig, resourceIds: string[]): boolean {
  return notice.dependsOn.length === 0 || resourceIds.length > 0;
}

// The resource was included through the chain of the notice (the same templates, possibly followed by nested ones)
function isWithin(resource: ResourceOrigin, notice: ResourceOrigin): boolean {
  return notice.templates.length <= resource.templates.length
    && notice.templates.every((t, i) => t.id === resource.templates[i].id && t.sourceKey === resource.templates[i].sourceKey);
}

function toNotice(notice: NoticeConfig): Notice {
  return {
    title: notice.title === undefined ? undefined : sanitize(notice.title),
    message: sanitize(notice.message),
    level: notice.level,
    template: notice.templateSource,
  };
}

function sanitize(text: string): string {
  return stripVTControlCharacters(text).replaceAll(CONTROL_CHARACTERS, '');
}
