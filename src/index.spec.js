import _fs from 'fs';
import util from 'util';

import pify from 'pify';
import _tmp from 'tmp';

import Hosts from './index';

const fs = pify(_fs);
const tmp = pify(_tmp);

describe('hosts', () => {

  const hosts = new Hosts({ noWrites: true });

  describe('modify', () => {

    beforeEach(() => {
      hosts.clearQueue();
    });

    describe('insertion / removal', () => {

      it('adds a new ip and host', () => {
        const orig = '127.0.0.1 localhost';
        const desired = '127.0.0.1 localhost\n127.0.0.2 localhost2';
        hosts.add('127.0.0.2', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('adds a new hostname to existing IP', () => {
        const orig = '127.0.0.1 localhost';
        const desired = '127.0.0.1 localhost localhost2';
        hosts.add('127.0.0.1', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('adding a duplicate host does not add it twice', () => {
        const orig = '127.0.0.1 localhost';
        hosts.add('127.0.0.1', 'localhost');
        expect(hosts.modify(orig)).toBe(orig);
      });

      it('removes a single hostname from an existing IP', () => {
        const orig = '127.0.0.1 localhost localhost2';
        const desired = '127.0.0.1 localhost';
        hosts.remove('127.0.0.1', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('removes line for IP with no hosts', () => {
        const orig = '127.0.0.1 localhost';
        const desired = '';
        hosts.remove('127.0.0.1', 'localhost');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('removes a single hostname from any IP', () => {
        const orig = '127.0.0.1 localhost admin';
        const desired = '127.0.0.1 localhost';
        hosts.removeHost('admin');
        expect(hosts.modify(orig)).toBe(desired);
      });

    });

    describe('preserves formatting', () => {

      it('leaves comments and newlines intact', () => {
        const orig = '# hosts\n\n127.0.0.1 localhost';
        const desired = '# hosts\n\n127.0.0.1 localhost localhost2';
        hosts.add('127.0.0.1', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('inserts comments before a final comment block', () => {
        const orig = '# start hosts\n\n127.0.0.1 localhost\n\n# end hosts';
        const desired = '# start hosts\n\n127.0.0.1 localhost\n127.0.0.2 localhost2\n\n# end hosts';
        hosts.add('127.0.0.2', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('preserves existing spaces & tabs', () => {
        const orig = '127.0.0.1\t\tlocalhost   localhost2';
        const desired = '127.0.0.1\t\tlocalhost   localhost2 localhost3';
        hosts.add('127.0.0.1', 'localhost3');
        expect(hosts.modify(orig)).toBe(desired);
      });

    });

  });

  describe('config options', () => {

    it('invalid options throw', () => {
      expect(
        () => new Hosts({ noSuchOption: true })
      ).toThrow();
    });

  });

  describe('file operations', () => {

    it('write occurs and fires writeSuccess event', done => {
      tmp.tmpName().then(filename => {
        fs.writeFile(filename, '127.0.0.1 localhost').then(() => {
          const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
          hosts.add('127.0.0.1', 'localhost2');
          hosts.on('writeSuccess', () => {
            fs.readFile(filename).then(output => {
              expect(output.toString()).toBe('127.0.0.1 localhost localhost2');
              done();
            });
          });
        });
      });
    });

    it('postWrite() returns a promise that resolves after write', async () => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
      hosts.add('127.0.0.1', 'localhost2');

      await hosts.postWrite();
      const output = (await fs.readFile(filename)).toString();
      expect(output).toBe('127.0.0.1 localhost localhost2');
    });

    it('file is reread if it has changed', async () => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
      hosts.add('127.0.0.1', 'localhost2');
      await hosts.postWrite();

      // change the file "externally" (i.e. another process)
      await fs.writeFile(filename, '127.0.0.1 localhost');

      hosts.add('127.0.0.1', 'localhost3');
      await hosts.postWrite();

      const output = (await fs.readFile(filename)).toString();
      expect(output).toBe('127.0.0.1 localhost localhost3');
    });

    it('file is not reread if it has not changed', async () => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost FAIL');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });

      // "Inject" the file, without using the real file contents (no FAIL host)
      const stats = await fs.stat(filename);
      hosts.hostsFile.ctimeMs = stats.ctimeMs;
      hosts.hostsFile.raw = '127.0.0.1 localhost';

      // This operation should not re-load the file, i.e. no "FAIL" host
      hosts.add('127.0.0.1', 'localhost2');
      await hosts.postWrite();

      const output = (await fs.readFile(filename)).toString();
      expect(output).toBe('127.0.0.1 localhost localhost2'); // no FAIL
    });

  });

});
