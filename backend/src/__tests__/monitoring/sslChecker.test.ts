import tls from 'tls';
import { fetchSSLInfo } from '../../monitoring/sslChecker';

jest.mock('tls');
const mockedTls = tls as jest.Mocked<typeof tls>;

describe('sslChecker – fetchSSLInfo', () => {
  it('returns valid cert info for a reachable host', (done) => {
    const mockCert = {
      subject: { CN: 'example.com' },
      issuer: { O: 'Let\'s Encrypt', CN: 'R3' },
      valid_from: 'Jan 1 00:00:00 2024 GMT',
      valid_to: 'Apr 1 00:00:00 2025 GMT',
      subjectaltname: 'DNS:example.com, DNS:www.example.com',
    };

    const mockSocket = {
      getPeerCertificate: jest.fn().mockReturnValue(mockCert),
      authorized: true,
      authorizationError: null,
      end: jest.fn(),
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'secureConnect') setTimeout(() => cb(), 0);
        return mockSocket;
      }),
    } as any;

    mockedTls.connect = jest.fn().mockReturnValue(mockSocket);

    fetchSSLInfo('example.com').then((result) => {
      expect(result.subject).toBe('CN=example.com');
      expect(result.issuer).toContain('Let');
      expect(result.isValid).toBe(true);
      expect(result.daysRemaining).toBeGreaterThan(0);
      done();
    });
  });

  it('marks cert as invalid when socket is not authorized', (done) => {
    const mockCert = {
      subject: { CN: 'example.com' },
      issuer: { O: 'Fake CA' },
      valid_from: 'Jan 1 00:00:00 2020 GMT',
      valid_to: 'Jan 1 00:00:00 2021 GMT',
    };

    const mockSocket = {
      getPeerCertificate: jest.fn().mockReturnValue(mockCert),
      authorized: false,
      authorizationError: 'CERT_HAS_EXPIRED',
      end: jest.fn(),
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'secureConnect') setTimeout(() => cb(), 0);
        return mockSocket;
      }),
    } as any;

    mockedTls.connect = jest.fn().mockReturnValue(mockSocket);

    fetchSSLInfo('example.com').then((result) => {
      expect(result.isValid).toBe(false);
      done();
    });
  });
});
