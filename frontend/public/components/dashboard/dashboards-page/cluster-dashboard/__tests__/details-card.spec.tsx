import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@console/shared/src/test-utils/unit-test-utils';
import { useFlag } from '@console/shared/src/hooks/useFlag';

import { DetailsCard } from '../details-card';
import { k8sVersion } from '../../../../../module/status';

jest.mock('@console/shared/src/hooks/useFlag', () => ({
  ...jest.requireActual('@console/shared/src/hooks/useFlag'),
  useFlag: jest.fn(),
}));

jest.mock('@console/shared/src/hooks/useCanClusterUpgrade', () => ({
  useCanClusterUpgrade: jest.fn(() => false),
}));

jest.mock('../../../../utils/k8s-watch-hook', () => ({
  useK8sWatchResource: jest.fn(() => [undefined, true, null]),
}));

jest.mock('@console/dynamic-plugin-sdk', () => ({
  ...jest.requireActual('@console/dynamic-plugin-sdk'),
  useResolvedExtensions: jest.fn(() => [[]]),
}));

jest.mock('../../../../../module/status', () => ({
  k8sVersion: jest.fn(),
}));

const useFlagMock = useFlag as jest.Mock;
const k8sVersionMock = k8sVersion as jest.Mock;

describe('DetailsCard', () => {
  beforeEach(() => {
    useFlagMock.mockReturnValue(false);
    window.SERVER_FLAGS.kubeAPIServerURL = 'https://kubernetes.default.svc';
    k8sVersionMock.mockResolvedValue({
      gitVersion: 'v1.31.0',
    });
  });

  afterEach(() => {
    useFlagMock.mockReset();
    k8sVersionMock.mockReset();
  });

  it('shows Kubernetes-specific details when OpenShift is disabled', async () => {
    renderWithProviders(<DetailsCard />);

    expect(screen.getByText('Cluster API address')).toBeInTheDocument();
    expect(screen.getByText('https://kubernetes.default.svc')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Kubernetes version')).toBeInTheDocument();
      expect(screen.getByText('v1.31.0')).toBeInTheDocument();
    });

    expect(screen.queryByText('View settings')).not.toBeInTheDocument();
    expect(screen.queryByText('OpenShift version')).not.toBeInTheDocument();
  });
});
