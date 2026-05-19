import { LinuxDistro, ResourceOs } from '@codifycli/schemas';
import { describe, expect, it, vi } from 'vitest';

import { OsUtils } from '../utils/os-utils.js';
import { Project } from './project.js';
import { ResourceConfig } from './resource-config.js';

function makeResource(type: string, os?: ResourceOs[], distro?: LinuxDistro[]): ResourceConfig {
  return new ResourceConfig({ type, ...(os ? { os } : {}), ...(distro ? { distro } : {}) });
}

function makeProject(...configs: ResourceConfig[]): Project {
  return new Project(null, configs, []);
}

describe('Project Unit Tests', () => {
  it('Can add unique names for duplicate resources', async () => {
    // const parser = Parser.supportedParsers['json']
    //
    // const resourceConfigs = await parser.parse(new InMemoryFile({
    //   fileName: 'test',
    //   fileType: 'json',
    //   contents: JSON.stringify([
    //     { type: 'git-clone', remote: 'git@git1' },
    //     { type: 'git-clone', remote: 'git@git1' },
    //     { type: 'git-clone', remote: 'git@git2' },
    //     { type: 'other' }
    //   ])
    // }))
    //
    // const project = new Project(null, resourceConfigs as ResourceConfig[])
    //
    // expect(project.resourceConfigs[0].id).to.eq('git-clone.0')
    // expect(project.resourceConfigs[1].id).to.eq('git-clone.1')
    // expect(project.resourceConfigs[2].id).to.eq('git-clone.2')
    // expect(project.resourceConfigs[3].id).to.eq('other')
  })

  describe('removeResourcesUsingOsFilter', () => {
    it('keeps resources with no os filter', () => {
      vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);

      const project = makeProject(
        makeResource('tool-a'),
        makeResource('tool-b'),
      );

      project.removeResourcesUsingOsFilter();

      expect(project.resourceConfigs).toHaveLength(2);
    });

    it('keeps resources that match the current os', () => {
      vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.MACOS);

      const project = makeProject(
        makeResource('mac-tool', [ResourceOs.MACOS]),
        makeResource('linux-tool', [ResourceOs.LINUX]),
      );

      project.removeResourcesUsingOsFilter();

      expect(project.resourceConfigs).toHaveLength(1);
      expect(project.resourceConfigs[0].type).toBe('mac-tool');
    });

    it('keeps resources that list multiple os including the current one', () => {
      vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.LINUX);

      const project = makeProject(
        makeResource('cross-platform', [ResourceOs.MACOS, ResourceOs.LINUX]),
      );

      project.removeResourcesUsingOsFilter();

      expect(project.resourceConfigs).toHaveLength(1);
    });

    it('removes resources whose os does not match the current os', () => {
      vi.spyOn(OsUtils, 'getOs').mockReturnValue(ResourceOs.WINDOWS);

      const project = makeProject(
        makeResource('mac-only', [ResourceOs.MACOS]),
        makeResource('linux-only', [ResourceOs.LINUX]),
      );

      project.removeResourcesUsingOsFilter();

      expect(project.resourceConfigs).toHaveLength(0);
    });
  });

  describe('removeResourcesUsingDistroFilter', () => {
    it('does nothing on macOS (not Linux)', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(false);

      const project = makeProject(
        makeResource('tool', undefined, [LinuxDistro.UBUNTU]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
    });

    it('does nothing when distro cannot be determined', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(undefined);

      const project = makeProject(
        makeResource('tool', undefined, [LinuxDistro.UBUNTU]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
    });

    it('keeps resources with no distro filter', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.UBUNTU);

      const project = makeProject(
        makeResource('tool-a'),
        makeResource('tool-b'),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(2);
    });

    it('keeps resources that match the current distro exactly', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.UBUNTU);

      const project = makeProject(
        makeResource('ubuntu-tool', undefined, [LinuxDistro.UBUNTU]),
        makeResource('arch-tool', undefined, [LinuxDistro.ARCH]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
      expect(project.resourceConfigs[0].type).toBe('ubuntu-tool');
    });

    it('keeps resources when current distro matches debian-based group', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.UBUNTU);

      const project = makeProject(
        makeResource('debian-tool', undefined, [LinuxDistro.DEBIAN_BASED]),
        makeResource('rpm-tool', undefined, [LinuxDistro.RPM_BASED]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
      expect(project.resourceConfigs[0].type).toBe('debian-tool');
    });

    it('keeps resources when current distro matches rpm-based group', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.FEDORA);

      const project = makeProject(
        makeResource('debian-tool', undefined, [LinuxDistro.DEBIAN_BASED]),
        makeResource('rpm-tool', undefined, [LinuxDistro.RPM_BASED]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
      expect(project.resourceConfigs[0].type).toBe('rpm-tool');
    });

    it('debian-based group covers all expected distros', async () => {
      const debianDistros = [
        LinuxDistro.DEBIAN,
        LinuxDistro.UBUNTU,
        LinuxDistro.MINT,
        LinuxDistro.POP_OS,
        LinuxDistro.ELEMENTARY_OS,
        LinuxDistro.KALI,
      ];

      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);

      for (const distro of debianDistros) {
        vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(distro);

        const project = makeProject(
          makeResource('tool', undefined, [LinuxDistro.DEBIAN_BASED]),
        );

        await project.removeResourcesUsingDistroFilter();

        expect(project.resourceConfigs).toHaveLength(1);
      }
    });

    it('rpm-based group covers all expected distros', async () => {
      const rpmDistros = [
        LinuxDistro.FEDORA,
        LinuxDistro.CENTOS,
        LinuxDistro.RHEL,
        LinuxDistro.AMAZON_LINUX,
        LinuxDistro.OPENSUSE,
        LinuxDistro.SUSE,
      ];

      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);

      for (const distro of rpmDistros) {
        vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(distro);

        const project = makeProject(
          makeResource('tool', undefined, [LinuxDistro.RPM_BASED]),
        );

        await project.removeResourcesUsingDistroFilter();

        expect(project.resourceConfigs).toHaveLength(1);
      }
    });

    it('removes resources when no distro in filter matches the current distro', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.ARCH);

      const project = makeProject(
        makeResource('tool', undefined, [LinuxDistro.UBUNTU, LinuxDistro.DEBIAN]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(0);
    });

    it('keeps resources that list multiple distros including the current one', async () => {
      vi.spyOn(OsUtils, 'isLinux').mockReturnValue(true);
      vi.spyOn(OsUtils, 'getLinuxDistro').mockResolvedValue(LinuxDistro.ARCH);

      const project = makeProject(
        makeResource('tool', undefined, [LinuxDistro.UBUNTU, LinuxDistro.ARCH]),
      );

      await project.removeResourcesUsingDistroFilter();

      expect(project.resourceConfigs).toHaveLength(1);
    });
  });
});
