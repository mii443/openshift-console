import { screen } from '@testing-library/react';

import { renderWithProviders } from '@console/shared/src/test-utils/unit-test-utils';
import { FLAGS } from '@console/shared/src/constants/common';
import { useFlag } from '@console/shared/src/hooks/useFlag';

import { ClusterDashboard } from '../cluster-dashboard';

jest.mock('@console/shared/src/hooks/useFlag', () => ({
  ...jest.requireActual('@console/shared/src/hooks/useFlag'),
  useFlag: jest.fn(),
}));

jest.mock('../../../../utils/k8s-get-hook', () => ({
  useK8sGet: jest.fn(() => [undefined, true, null]),
}));

jest.mock('@console/shared/src/components/dashboard/Dashboard', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock('@console/shared/src/components/dashboard/DashboardGrid', () => ({
  __esModule: true,
  default: jest.fn(({ mainCards, leftCards, rightCards }) => (
    <div>
      <div data-test="main-cards">
        {mainCards.map(({ Card }, index) => (
          <Card key={`main-${index}`} />
        ))}
      </div>
      <div data-test="left-cards">
        {leftCards.map(({ Card }, index) => (
          <Card key={`left-${index}`} />
        ))}
      </div>
      <div data-test="right-cards">
        {rightCards.map(({ Card }, index) => (
          <Card key={`right-${index}`} />
        ))}
      </div>
    </div>
  )),
}));

jest.mock('../status-card', () => ({
  StatusCard: () => 'Status Card',
}));

jest.mock('../details-card', () => ({
  DetailsCard: () => 'Details Card',
}));

jest.mock('../inventory-card', () => ({
  InventoryCard: () => 'Inventory Card',
}));

jest.mock('../utilization-card', () => ({
  UtilizationCard: () => 'Utilization Card',
}));

jest.mock('../activity-card', () => ({
  ActivityCard: () => 'Activity Card',
}));

jest.mock('../getting-started/getting-started-section', () => ({
  GettingStartedSection: () => 'Getting Started Section',
}));

const useFlagMock = useFlag as jest.Mock;

describe('ClusterDashboard', () => {
  beforeEach(() => {
    useFlagMock.mockImplementation((flag: string) => {
      switch (flag) {
        case FLAGS.OPENSHIFT:
          return false;
        case FLAGS.CONSOLE_CAPABILITY_GETTINGSTARTEDBANNER_IS_ENABLED:
          return true;
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    useFlagMock.mockReset();
  });

  it('renders a Kubernetes-safe overview when OpenShift is disabled', () => {
    const { container } = renderWithProviders(<ClusterDashboard />);
    const leftCards = container.querySelector('[data-test="left-cards"]');
    const mainCards = container.querySelector('[data-test="main-cards"]');
    const rightCards = container.querySelector('[data-test="right-cards"]');

    expect(mainCards).toHaveTextContent('Status Card');
    expect(mainCards).toHaveTextContent('Utilization Card');
    expect(leftCards).toHaveTextContent('Details Card');
    expect(leftCards).toHaveTextContent('Inventory Card');
    expect(rightCards).toHaveTextContent('Activity Card');
    expect(screen.queryByText('Getting Started Section')).not.toBeInTheDocument();
  });

  it('renders the full OpenShift overview when OpenShift is enabled', () => {
    useFlagMock.mockImplementation((flag: string) => {
      switch (flag) {
        case FLAGS.OPENSHIFT:
          return true;
        case FLAGS.CONSOLE_CAPABILITY_GETTINGSTARTEDBANNER_IS_ENABLED:
          return true;
        default:
          return undefined;
      }
    });

    const { container } = renderWithProviders(<ClusterDashboard />);
    const leftCards = container.querySelector('[data-test="left-cards"]');
    const mainCards = container.querySelector('[data-test="main-cards"]');
    const rightCards = container.querySelector('[data-test="right-cards"]');

    expect(mainCards).toHaveTextContent('Status Card');
    expect(mainCards).toHaveTextContent('Utilization Card');
    expect(leftCards).toHaveTextContent('Details Card');
    expect(leftCards).toHaveTextContent('Inventory Card');
    expect(rightCards).toHaveTextContent('Activity Card');
    expect(screen.getByText('Getting Started Section')).toBeInTheDocument();
  });
});
