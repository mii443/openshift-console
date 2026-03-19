import { FLAGS } from '@console/shared/src/constants/common';
import { getLandingPageURL } from '../perspective';

describe('getLandingPageURL', () => {
  it('returns dashboards on Kubernetes when namespaces can be listed', () => {
    expect(
      getLandingPageURL(
        {
          [FLAGS.OPENSHIFT]: false,
          [FLAGS.CAN_GET_NS]: true,
        },
        false,
      ),
    ).toBe('/dashboards');
  });

  it('returns search on Kubernetes when namespaces cannot be listed', () => {
    expect(
      getLandingPageURL(
        {
          [FLAGS.OPENSHIFT]: false,
          [FLAGS.CAN_GET_NS]: false,
        },
        false,
      ),
    ).toBe('/search');
  });

  it('returns dashboards on OpenShift when monitoring is available', () => {
    expect(
      getLandingPageURL(
        {
          [FLAGS.OPENSHIFT]: true,
          [FLAGS.CAN_LIST_NS]: true,
          [FLAGS.MONITORING]: true,
        },
        false,
      ),
    ).toBe('/dashboards');
  });

  it('returns projects on OpenShift when monitoring is unavailable', () => {
    expect(
      getLandingPageURL(
        {
          [FLAGS.OPENSHIFT]: true,
          [FLAGS.CAN_LIST_NS]: true,
          [FLAGS.MONITORING]: false,
        },
        false,
      ),
    ).toBe('/k8s/cluster/projects');
  });
});
