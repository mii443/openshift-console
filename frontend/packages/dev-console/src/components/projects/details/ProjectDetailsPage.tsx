import type { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';
import { ProjectDashboard } from '@console/internal/components/dashboard/project-dashboard/project-dashboard';
import { DetailsPage } from '@console/internal/components/factory';
import { NamespaceDetails } from '@console/internal/components/namespace';
import { withStartGuide } from '@console/internal/components/start-guide';
import type { Page } from '@console/internal/components/utils';
import { useAccessReview } from '@console/internal/components/utils';
import { NamespaceModel, ProjectModel, RoleBindingModel } from '@console/internal/models';
import { referenceForModel } from '@console/internal/module/k8s';
import LazyActionMenu from '@console/shared/src/components/actions/LazyActionMenu';
import { ActionMenuVariant } from '@console/shared/src/components/actions/types';
import { DocumentTitle } from '@console/shared/src/components/document-title/DocumentTitle';
import { ALL_NAMESPACES_KEY } from '@console/shared/src/constants';
import { FLAGS } from '@console/shared/src/constants/common';
import { useFlag } from '@console/shared/src/hooks/useFlag';
import NamespacedPage, { NamespacedPageVariants } from '../../NamespacedPage';
import ProjectAccessPage from '../../project-access/ProjectAccessPage';
import CreateProjectListPage, { CreateAProjectButton } from '../CreateProjectListPage';

export const PROJECT_DETAILS_ALL_NS_PAGE_URI = '/project-details/all-namespaces';

interface MonitoringPageProps {
  noProjectsAvailable?: boolean;
}

const handleNamespaceChange = (newNamespace: string, navigate: NavigateFunction): void => {
  if (newNamespace === ALL_NAMESPACES_KEY) {
    navigate(PROJECT_DETAILS_ALL_NS_PAGE_URI);
  }
};

const ProjectDetails = (props) => {
  const { t } = useTranslation();
  const { activeNamespace, pages } = props;
  const isOpenShift = useFlag(FLAGS.OPENSHIFT);
  const resourceModel = isOpenShift ? ProjectModel : NamespaceModel;

  return (
    <DetailsPage
      {...props}
      breadcrumbsFor={() => [
        {
          name: isOpenShift ? t('devconsole~Projects') : t('public~Namespaces'),
          path: '/project-details/all-namespaces',
        },
        {
          name: isOpenShift ? t('devconsole~Project Details') : activeNamespace,
          path: `/project-details/ns/${activeNamespace}`,
        },
      ]}
      name={activeNamespace}
      kind={referenceForModel(resourceModel)}
      customActionMenu={(k8sObj, obj) => (
        <LazyActionMenu
          context={{ [referenceForModel(resourceModel)]: obj }}
          variant={ActionMenuVariant.DROPDOWN}
          label={t('devconsole~Actions')}
        />
      )}
      kindObj={resourceModel}
      customData={{ activeNamespace, hideHeading: true }}
      pages={pages}
    />
  );
};

export const PageContents: FC<MonitoringPageProps> = ({ noProjectsAvailable, ...props }) => {
  const { t } = useTranslation();
  const params = useParams();
  const activeNamespace = params.ns;
  const isOpenShift = useFlag(FLAGS.OPENSHIFT);
  const emptyStateTitle = isOpenShift
    ? 'Select a Project to view its details'
    : 'Select a Namespace to view its details';
  const pageTitle = isOpenShift ? t('devconsole~Project Details') : t('public~Namespaces');

  const canListRoleBindings = useAccessReview({
    group: RoleBindingModel.apiGroup,
    resource: RoleBindingModel.plural,
    verb: 'list',
    namespace: activeNamespace,
  });

  const canCreateRoleBindings = useAccessReview({
    group: RoleBindingModel.apiGroup,
    resource: RoleBindingModel.plural,
    verb: 'create',
    namespace: activeNamespace,
  });

  const pages: Page[] = [
    {
      href: '',
      // t('devconsole~Overview')
      nameKey: 'devconsole~Overview',
      component: ProjectDashboard,
    },
    {
      href: 'details',
      // t('devconsole~Details')
      nameKey: 'devconsole~Details',
      component: NamespaceDetails,
    },
  ];
  if (canListRoleBindings && canCreateRoleBindings) {
    pages.push({
      href: 'access',
      // t('devconsole~Project access')
      nameKey: 'devconsole~Project access',
      component: ProjectAccessPage,
    });
  }

  return !noProjectsAvailable && activeNamespace ? (
    <ProjectDetails {...props} activeNamespace={activeNamespace} pages={pages} />
  ) : (
    <CreateProjectListPage title={pageTitle}>
      {(openProjectModal) => (
        <Trans t={t} ns="devconsole">
          {emptyStateTitle}
          <CreateAProjectButton openProjectModal={openProjectModal} />.
        </Trans>
      )}
    </CreateProjectListPage>
  );
};

const PageContentsWithStartGuide = withStartGuide<MonitoringPageProps>(PageContents);

export const ProjectDetailsPage: FC<MonitoringPageProps> = (props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOpenShift = useFlag(FLAGS.OPENSHIFT);
  return (
    <>
      <DocumentTitle>
        {isOpenShift ? t('devconsole~Project Details') : t('public~Namespaces')}
      </DocumentTitle>
      <NamespacedPage
        hideApplications
        variant={NamespacedPageVariants.light}
        onNamespaceChange={(newNamespace) => handleNamespaceChange(newNamespace, navigate)}
      >
        <PageContentsWithStartGuide {...props} />
      </NamespacedPage>
    </>
  );
};

export default ProjectDetailsPage;
