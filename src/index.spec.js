import _fs from 'fs';
import util from 'util';

import pify from 'pify';
import _tmp from 'tmp';

import Hosts, { noop } from './index';

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

      it('add() can be run twice (branch check)', () => {
        const orig = '127.0.0.1 localhost';
        const desired = '127.0.0.1 localhost localhost2 localhost3';
        hosts.add('127.0.0.1', 'localhost2');
        hosts.add('127.0.0.1', 'localhost3');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('add() accepts an array of hosts as a 2nd arg', () => {
        const orig = '127.0.0.1 localhost';
        const desired = '127.0.0.1 localhost localhost2 localhost3';
        hosts.add('127.0.0.1', ['localhost2', 'localhost3']);
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('add() throws on invalid host arg', () => {
        expect(() => {
          hosts.add('127.0.0.1', {});
        }).toThrow('expects `host`');
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

      it('correctly adds to a blank hosts file', () => {
        const orig = '';
        const desired = '127.0.0.1 localhost';
        hosts.add('127.0.0.1', 'localhost');
        expect(hosts.modify(orig)).toBe(desired);
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

      it('can remove all hosts / an entire line', () => {
        const orig = '127.0.0.1 localhost\n127.0.0.2 localhost2 localhost3';
        const desired = '127.0.0.1 localhost\n';
        hosts.remove('127.0.0.2', '*');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('can remove an array of hosts', () => {
        const orig = '127.0.0.1 localhost localhost2 localhost3 localhost4';
        const desired = '127.0.0.1 localhost localhost4';
        hosts.remove('127.0.0.1', ['localhost2', 'localhost3']);
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('remove() throws on invalid host arg', () => {
        expect(() => {
          hosts.remove('127.0.0.1', {});
        }).toThrow('expects `host`');
      });

      it('remove a host after * works as expected', () => {
        const orig = '127.0.0.1 localhost\n127.0.0.2 localhost2 localhost3';
        const desired = '127.0.0.1 localhost\n';
        hosts.remove('127.0.0.2', '*');
        hosts.remove('127.0.0.2', 'localhost3');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('does not break on broken hosts file', () => {
        const orig = '127.0.0.1';
        const desired = '127.0.0.1 localhost';
        hosts.add('127.0.0.1', 'localhost');
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

    describe('header section', () => {

      it('place new entries below a header section (with no entries)', () => {
        const   hosts = new Hosts({ noWrites: true, header: 'test' });
        const    orig = '127.0.0.1 localhost\n\n# test\n\n192.168.0.1 other';
        const desired = '127.0.0.1 localhost\n\n# test\n127.0.0.2 localhost2\n\n192.168.0.1 other';
        hosts.add('127.0.0.2', 'localhost2');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('place new entries at the bottom of a header section', () => {
        const   hosts = new Hosts({ noWrites: true, header: 'test' });
        const    orig = '127.0.0.1 localhost\n\n# test\n127.0.0.2 localhost2\n\n192.168.0.1 other';
        const desired = '127.0.0.1 localhost\n\n# test\n127.0.0.2 localhost2\n127.0.0.3 localhost3\n\n192.168.0.1 other';
        hosts.add('127.0.0.3', 'localhost3');
        expect(hosts.modify(orig)).toBe(desired);
      });

      it('create a new header section if it does not exist', () => {
        const   hosts = new Hosts({ noWrites: true, header: 'test' });
        const    orig = '127.0.0.1 localhost\n\n192.168.0.1 other';
        const desired = '127.0.0.1 localhost\n\n# test\n127.0.0.2 localhost2\n\n192.168.0.1 other';
        hosts.add('127.0.0.2', 'localhost2');
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

    it('noWrites: true', () => {
      const hosts = new Hosts({ noWrites: true });
      expect(hosts._queueUpdate).toEqual(noop);
    });

  });

  describe('file operations', () => {

    it('write occurs and fires updateFinish event', done => {
      tmp.tmpName().then(filename => {
        fs.writeFile(filename, '127.0.0.1 localhost').then(() => {
          const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
          hosts.add('127.0.0.1', 'localhost2');
          hosts.on('updateFinish', () => {
            fs.readFile(filename).then(output => {
              expect(output.toString()).toBe('127.0.0.1 localhost localhost2');
              fs.unlink(filename);
              done();
            });
          });
        });
      });
    });

    it('updateFinish() returns a promise that resolves after write', (done) => {
      const hosts = new Hosts();
      const promise = hosts.updateFinish();
      expect(promise).toBeInstanceOf(Promise);
      promise.then(done).catch(err => done(err));
      hosts._runUpdateFinishCallbacks();
    });

    it('updateFinish() returns a promise that rejects after write failure', (done) => {
      const hosts = new Hosts();
      const promise = hosts.updateFinish();
      expect(promise).toBeInstanceOf(Promise);
      promise.then(() => done(new Error('Should not resolve!'))).catch(() => done());
      hosts._runUpdateFinishCallbacks(new Error());
    });

    it('updateFinish(callback) callls callback after write', (done) => {
      tmp.tmpName().then(filename => {
        fs.writeFile(filename, '127.0.0.1 localhost').then(() => {
          const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
          hosts.add('127.0.0.1', 'localhost2');
          hosts.updateFinish(() => {
            fs.readFile(filename).then(output => {
              expect(output.toString()).toBe('127.0.0.1 localhost localhost2');
              fs.unlink(filename);
              done();
            });
          });
        });
      });
    });

    it('file is reread if it has changed', async () => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
      hosts.add('127.0.0.1', 'localhost2');
      await hosts.updateFinish();

      // change the file "externally" (i.e. another process)
      await fs.writeFile(filename, '127.0.0.1 localhost');

      hosts.add('127.0.0.1', 'localhost3');
      await hosts.updateFinish();

      const output = (await fs.readFile(filename)).toString();
      expect(output).toBe('127.0.0.1 localhost localhost3');
      fs.unlink(filename);
    });

    it('file is not reread if it has not changed', async () => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost FAIL');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });

      // "Inject" the file, without using the real file contents (no FAIL host)
      const stats = await fs.stat(filename);
      hosts.hostsFile.ctime = stats.ctime;
      hosts.hostsFile.raw = '127.0.0.1 localhost';

      // This operation should not re-load the file, i.e. no "FAIL" host
      hosts.add('127.0.0.1', 'localhost2');
      await hosts.updateFinish();

      const output = (await fs.readFile(filename)).toString();
      expect(output).toBe('127.0.0.1 localhost localhost2'); // no FAIL
      fs.unlink(filename);
    });

    it('rethrows readFile errors', async (done) => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost FAIL');
      await fs.chmod(filename, 0);
      const hosts = new Hosts({ hostsFile: filename });
      hosts._update(err => {
        /* {
          Error: EACCES: permission denied, open '/tmp/tmp-25275e8XtKkaY2Yo0'
          errno: -13,
          code: 'EACCES',
          syscall: 'open',
          path: '/tmp/tmp-25275e8XtKkaY2Yo0'
        } */
        expect(err).toBeDefined();
        expect(err.code).toBe('EACCES');
        fs.unlink(filename);
        done();
      });
    });

    it('update() will never run concurrently', async (done) => {
      const filename = await tmp.tmpName();
      await fs.writeFile(filename, '127.0.0.1 localhost');

      const hosts = new Hosts({ hostsFile: filename, debounceTime: 0, atomicWrites: false });
      hosts.add('127.0.0.1', 'localhost2');

      hosts._queueUpdate = jest.fn();
      hosts.on('updateStart', async () => {
        expect(hosts._queueUpdate).not.toHaveBeenCalled();
        hosts._update(err => { if (err) done(err) });
        expect(hosts._queueUpdate).toHaveBeenCalled();

        await hosts.updateFinish();
        const output = (await fs.readFile(filename)).toString();
        expect(output).toBe('127.0.0.1 localhost localhost2');
        fs.unlink(filename);
        done();
      });
    });

  });

});
