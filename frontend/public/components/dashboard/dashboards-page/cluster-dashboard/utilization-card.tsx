import type { FC, Ref, MouseEvent, ComponentType } from 'react';
import { useState, useMemo, useEffect } from 'react';
import * as _ from 'lodash';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  MenuToggle,
  MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  Split,
  SplitItem,
} from '@patternfly/react-core';
import {
  ClusterOverviewUtilizationItem,
  isClusterOverviewUtilizationItem,
  ClusterOverviewMultilineUtilizationItem,
  isClusterOverviewMultilineUtilizationItem,
  useResolvedExtensions,
  Humanize,
  TopConsumerPopoverProps,
} from '@console/dynamic-plugin-sdk';
import UtilizationItem, {
  MultilineUtilizationItem,
  QueryWithDescription,
  LimitRequested,
  trimSecondsXMutator,
} from '@console/shared/src/components/dashboard/utilization-card/UtilizationItem';
import { UtilizationBody } from '@console/shared/src/components/dashboard/utilization-card/UtilizationBody';
import { ByteDataTypes } from '@console/shared/src/graph-helper/data-utils';

import { useDashboardResources } from '@console/shared/src/hooks/useDashboardResources';
import {
  humanizeBinaryBytes,
  humanizeCpuCores,
  humanizeNumber,
  humanizeDecimalBytesPerSec,
  humanizePercentage,
  convertToBaseValue,
} from '../../../utils/units';
import { getRangeVectorStats, getInstantVectorStats } from '../../../graphs/utils';
import {
  getMultilineQueries,
  getUtilizationQueries,
  OverviewQuery,
} from '@console/shared/src/promql/cluster-dashboard';
import { MachineConfigPoolModel, NodeModel, PodModel } from '../../../../models';
import { getPrometheusQueryResponse } from '../../../../actions/dashboards';
import { DataPoint, PrometheusResponse } from '../../../graphs';
import { useK8sWatchResource } from '@console/internal/components/utils/k8s-watch-hook';
import {
  K8sResourceKind,
  MachineConfigPoolKind,
  referenceForModel,
} from '@console/internal/module/k8s';
import { UtilizationDurationDropdown } from '@console/shared/src/components/dashboard/utilization-card/UtilizationDurationDropdown';
import { useUtilizationDuration } from '@console/shared/src/hooks/useUtilizationDuration';
import { useFlag } from '@console/shared/src/hooks/useFlag';
import { FLAGS } from '@console/shared/src/constants/common';
import { usePrometheusGate } from '@console/shared/src/hooks/usePrometheusGate';
import {
  ClusterUtilizationContext,
  CPUPopover,
  MemoryPopover,
  StoragePopover,
  NetworkInPopover,
  NetworkOutPopover,
  PodPopover,
} from './utilization-popovers';
import { coFetchJSON } from '../../../../co-fetch';
import { k8sBasePath } from '../../../../module/k8s';

const networkPopovers = [NetworkInPopover, NetworkOutPopover];

type NodeMetric = {
  metadata?: { name?: string };
  usage?: { cpu?: string; memory?: string };
};

type NodeMetricsResponse = {
  items?: NodeMetric[];
};

const KubernetesUtilizationItem: FC<{ title: string; value?: string; error?: string }> = ({
  title,
  value,
  error,
}) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{title}</DescriptionListTerm>
    <DescriptionListDescription>{error || value}</DescriptionListDescription>
  </DescriptionListGroup>
);

const KubernetesUtilizationCard: FC = () => {
  const { t } = useTranslation();
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetric[]>([]);
  const [nodeMetricsError, setNodeMetricsError] = useState();
  const [nodes, nodesLoaded, nodesLoadError] = useK8sWatchResource<K8sResourceKind[]>({
    isList: true,
    kind: referenceForModel(NodeModel),
  });
  const [pods, podsLoaded, podsLoadError] = useK8sWatchResource<K8sResourceKind[]>({
    isList: true,
    kind: referenceForModel(PodModel),
  });

  useEffect(() => {
    coFetchJSON(`${k8sBasePath}/apis/metrics.k8s.io/v1beta1/nodes`).then(
      (response) => {
        setNodeMetrics(((response as NodeMetricsResponse).items ?? []) as NodeMetric[]);
        setNodeMetricsError(undefined);
      },
      (error) => {
        setNodeMetrics([]);
        setNodeMetricsError(error);
      },
    );
  }, []);

  const metricsByNodeName = useMemo(() => _.keyBy(nodeMetrics, (metric) => metric.metadata?.name), [
    nodeMetrics,
  ]);

  const totals = useMemo(() => {
    const aggregate = (nodes ?? []).reduce(
      (acc, node) => {
        const allocatable = node.status?.allocatable ?? {};
        const metric = metricsByNodeName[node.metadata?.name];
        acc.totalCPU += convertToBaseValue(allocatable.cpu) ?? 0;
        acc.totalMemory += convertToBaseValue(allocatable.memory) ?? 0;
        acc.totalPods += convertToBaseValue(allocatable.pods) ?? 0;
        acc.usedCPU += convertToBaseValue(metric?.usage?.cpu) ?? 0;
        acc.usedMemory += convertToBaseValue(metric?.usage?.memory) ?? 0;
        const readyCondition = node.status?.conditions?.find(
          (condition) => condition.type === 'Ready',
        );
        if (readyCondition?.status === 'True') {
          acc.readyNodes += 1;
        }
        return acc;
      },
      {
        totalCPU: 0,
        usedCPU: 0,
        totalMemory: 0,
        usedMemory: 0,
        totalPods: 0,
        readyNodes: 0,
      },
    );

    return {
      ...aggregate,
      totalNodes: nodes?.length ?? 0,
      runningPods: (pods ?? []).filter(
        (pod) => !['Succeeded', 'Failed'].includes(pod.status?.phase),
      ).length,
    };
  }, [metricsByNodeName, nodes, pods]);

  const notAvailable = t('public~Not available');
  const getUsageValue = (used: number, total: number, humanizeValue) => {
    if (!total) {
      return notAvailable;
    }
    return `${humanizeValue(used).string} / ${humanizeValue(total).string} (${
      humanizePercentage((used / total) * 100).string
    })`;
  };

  return (
    <Card data-test-id="utilization-card">
      <CardHeader>
        <CardTitle data-test="utilization-card__title">{t('public~Cluster utilization')}</CardTitle>
      </CardHeader>
      <CardBody>
        <DescriptionList isCompact>
          <KubernetesUtilizationItem
            title={t('public~CPU')}
            value={getUsageValue(totals.usedCPU, totals.totalCPU, humanizeCpuCores)}
            error={!nodesLoaded || nodeMetricsError || nodesLoadError ? notAvailable : undefined}
          />
          <KubernetesUtilizationItem
            title={t('public~Memory')}
            value={getUsageValue(totals.usedMemory, totals.totalMemory, humanizeBinaryBytes)}
            error={!nodesLoaded || nodeMetricsError || nodesLoadError ? notAvailable : undefined}
          />
          <KubernetesUtilizationItem
            title={t('public~Pod count')}
            value={
              totals.totalPods
                ? `${humanizeNumber(totals.runningPods).string} / ${
                    humanizeNumber(totals.totalPods).string
                  } (${humanizePercentage((totals.runningPods / totals.totalPods) * 100).string})`
                : notAvailable
            }
            error={!podsLoaded || podsLoadError ? notAvailable : undefined}
          />
          <KubernetesUtilizationItem
            title={t('public~Nodes')}
            value={
              totals.totalNodes
                ? `${humanizeNumber(totals.readyNodes).string} ${t('public~Ready')} / ${
                    humanizeNumber(totals.totalNodes).string
                  }`
                : notAvailable
            }
            error={!nodesLoaded || nodesLoadError ? notAvailable : undefined}
          />
        </DescriptionList>
      </CardBody>
    </Card>
  );
};

export const PrometheusUtilizationItem: FC<PrometheusUtilizationItemProps> = ({
  utilizationQuery,
  totalQuery,
  title,
  TopConsumerPopover,
  humanizeValue,
  byteDataType,
  isDisabled = false,
  limitQuery,
  requestQuery,
  setLimitReqState,
}) => {
  const { duration } = useUtilizationDuration();

  const queries = useMemo(() => {
    if (isDisabled) {
      return [];
    }
    const result = [
      { query: utilizationQuery, timespan: duration },
      totalQuery && { query: totalQuery },
      limitQuery && { query: limitQuery, timespan: duration },
      requestQuery && { query: requestQuery, timespan: duration },
    ].filter(Boolean);
    return result as { query: string; timespan?: number }[];
  }, [isDisabled, utilizationQuery, totalQuery, limitQuery, requestQuery, duration]);

  const dashboardResources = useDashboardResources({
    prometheusQueries: queries,
  });
  const prometheusResults = dashboardResources.prometheusResults;

  let utilization: PrometheusResponse, utilizationError: any;
  let total: PrometheusResponse, totalError: any;
  let max: DataPoint<number>[];
  let limit: PrometheusResponse, limitError: any;
  let request: PrometheusResponse, requestError: any;
  let isLoading = false;

  if (!isDisabled) {
    [utilization, utilizationError] = getPrometheusQueryResponse(
      prometheusResults,
      utilizationQuery,
      duration,
    );
    [total, totalError] = getPrometheusQueryResponse(prometheusResults, totalQuery);
    [limit, limitError] = getPrometheusQueryResponse(prometheusResults, limitQuery, duration);
    [request, requestError] = getPrometheusQueryResponse(prometheusResults, requestQuery, duration);

    max = getInstantVectorStats(total);
    isLoading = !utilization || (totalQuery && !total) || (limitQuery && !limit);
  }

  return (
    <UtilizationItem
      title={title}
      utilization={utilization}
      limit={limit}
      requested={request}
      error={utilizationError || totalError || limitError || requestError}
      isLoading={isLoading}
      humanizeValue={humanizeValue}
      byteDataType={byteDataType}
      query={[utilizationQuery, limitQuery, requestQuery]}
      max={max && max.length ? max[0].y : null}
      TopConsumerPopover={TopConsumerPopover}
      setLimitReqState={setLimitReqState}
    />
  );
};

export const PrometheusMultilineUtilizationItem: FC<PrometheusMultilineUtilizationItemProps> = ({
  queries,
  title,
  TopConsumerPopovers,
  humanizeValue,
  byteDataType,
  isDisabled = false,
}) => {
  const { duration } = useUtilizationDuration();

  const prometheusQueries = useMemo(() => {
    if (isDisabled) {
      return [];
    }
    return queries.map((q) => ({ query: q.query, timespan: duration }));
  }, [isDisabled, queries, duration]);

  const dashboardResources = useDashboardResources({
    prometheusQueries,
  });
  const prometheusResults = dashboardResources.prometheusResults;

  const stats = [];
  let hasError = false;
  let isLoading = false;
  if (!isDisabled) {
    queries.forEach((query) => {
      const [response, responseError] = getPrometheusQueryResponse(
        prometheusResults,
        query.query,
        duration,
      );
      if (responseError) {
        hasError = true;
        return false;
      }
      if (!response) {
        isLoading = true;
        return false;
      }
      stats.push(getRangeVectorStats(response, query.desc, null, trimSecondsXMutator)?.[0] || []);
    });
  }

  return (
    <MultilineUtilizationItem
      title={title}
      data={stats}
      error={hasError}
      isLoading={isLoading}
      humanizeValue={humanizeValue}
      byteDataType={byteDataType}
      queries={queries}
      TopConsumerPopovers={TopConsumerPopovers}
    />
  );
};

const UtilizationCardNodeFilter: FC<UtilizationCardNodeFilterProps> = ({
  machineConfigPools,
  onNodeSelect,
  selectedNodes,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const sortedMCPs = machineConfigPools.sort((a, b) => {
    const order = ['worker', 'master'];
    const indexA = order.indexOf(a.metadata.name);
    const indexB = order.indexOf(b.metadata.name);
    if (indexA === -1 && indexB === -1) {
      return a.metadata.name.localeCompare(b.metadata.name);
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });

  const selectOptions = sortedMCPs.map((mcp) => {
    const mcpName = mcp.metadata.name === 'master' ? 'control plane' : mcp.metadata.name;
    return (
      <SelectOption
        hasCheckbox
        key={mcp.metadata.name}
        value={mcpName}
        isSelected={selectedNodes.includes(mcp.metadata.name)}
      >
        {mcpName}
      </SelectOption>
    );
  });

  const toggle = (toggleRef: Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={(open) => setIsOpen(open)} variant="plainText">
      {t('public~Filter by Node type')}
      {selectedNodes.length > 0 && (
        <Badge className="pf-v6-u-ml-sm" isRead>
          {selectedNodes.length}
        </Badge>
      )}
    </MenuToggle>
  );

  return (
    <Select
      role="menu"
      aria-label={t('public~Filter by Node type')}
      onSelect={onNodeSelect}
      isOpen={isOpen}
      selected={selectedNodes}
      onOpenChange={(open) => setIsOpen(open)}
      toggle={toggle}
    >
      <SelectList>{selectOptions}</SelectList>
    </Select>
  );
};

export const UtilizationCard = () => {
  const { t } = useTranslation();
  const hasMachineConfig = useFlag(FLAGS.MACHINE_CONFIG);
  const openshiftFlag = useFlag(FLAGS.OPENSHIFT);
  const prometheusAvailable = usePrometheusGate();
  const [machineConfigPools, machineConfigPoolsLoaded] = useK8sWatchResource<
    MachineConfigPoolKind[]
  >(
    hasMachineConfig
      ? {
          isList: true,
          kind: referenceForModel(MachineConfigPoolModel),
        }
      : ({} as never),
  );
  // TODO: add `useUserPreference` to get default selected
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  const [dynamicItemExtensions] = useResolvedExtensions<ClusterOverviewUtilizationItem>(
    isClusterOverviewUtilizationItem,
  );
  const [dynamicMultilineItemExtensions] = useResolvedExtensions<
    ClusterOverviewMultilineUtilizationItem
  >(isClusterOverviewMultilineUtilizationItem);

  // TODO: add `useUserPreferenceCompatibility` to store selectedNodes
  const onNodeSelect = (event: MouseEvent, selection: string) => {
    const selectionUpdated = selection === 'control plane' ? 'master' : selection;
    if (selectedNodes.includes(selectionUpdated)) {
      setSelectedNodes(selectedNodes.filter((item) => item !== selectionUpdated));
    } else {
      setSelectedNodes([...selectedNodes, selectionUpdated]);
    }
  };
  // if no filter is applied, show all nodes using regex
  const nodeType = _.isEmpty(selectedNodes) ? '.+' : selectedNodes.join('|');
  const [utilizationQueries, multilineQueries] = useMemo(
    () => [getUtilizationQueries(nodeType), getMultilineQueries(nodeType)],
    [nodeType],
  );
  const cardLoaded = hasMachineConfig ? machineConfigPoolsLoaded : true;
  const availableMachineConfigPools = hasMachineConfig ? machineConfigPools : [];
  const isOpenShift = !!openshiftFlag;

  if (!isOpenShift && !prometheusAvailable) {
    return <KubernetesUtilizationCard />;
  }

  return (
    cardLoaded && (
      <Card data-test-id="utilization-card">
        <CardHeader
          actions={{
            actions: (
              <>
                <Split>
                  {availableMachineConfigPools.length > 0 && (
                    <SplitItem>
                      <UtilizationCardNodeFilter
                        machineConfigPools={availableMachineConfigPools}
                        onNodeSelect={onNodeSelect}
                        selectedNodes={selectedNodes}
                      />
                    </SplitItem>
                  )}
                  <SplitItem>
                    <UtilizationDurationDropdown />
                  </SplitItem>
                </Split>
              </>
            ),
            hasNoOffset: false,
            className: undefined,
          }}
        >
          <CardTitle data-test="utilization-card__title">
            {t('public~Cluster utilization')}
          </CardTitle>
        </CardHeader>
        <UtilizationBody>
          <ClusterUtilizationContext.Provider value={nodeType}>
            <PrometheusUtilizationItem
              title={t('public~CPU')}
              utilizationQuery={utilizationQueries[OverviewQuery.CPU_UTILIZATION].utilization}
              totalQuery={utilizationQueries[OverviewQuery.CPU_UTILIZATION].total}
              requestQuery={utilizationQueries[OverviewQuery.CPU_UTILIZATION].requests}
              TopConsumerPopover={CPUPopover}
              humanizeValue={humanizeCpuCores}
            />
            <PrometheusUtilizationItem
              title={t('public~Memory')}
              utilizationQuery={utilizationQueries[OverviewQuery.MEMORY_UTILIZATION].utilization}
              totalQuery={utilizationQueries[OverviewQuery.MEMORY_UTILIZATION].total}
              requestQuery={utilizationQueries[OverviewQuery.MEMORY_UTILIZATION].requests}
              TopConsumerPopover={MemoryPopover}
              humanizeValue={humanizeBinaryBytes}
              byteDataType={ByteDataTypes.BinaryBytes}
            />
            <PrometheusUtilizationItem
              title={t('public~Filesystem')}
              utilizationQuery={utilizationQueries[OverviewQuery.STORAGE_UTILIZATION].utilization}
              totalQuery={utilizationQueries[OverviewQuery.STORAGE_UTILIZATION].total}
              TopConsumerPopover={StoragePopover}
              humanizeValue={humanizeBinaryBytes}
              byteDataType={ByteDataTypes.BinaryBytes}
            />
            <PrometheusMultilineUtilizationItem
              title={t('public~Network transfer')}
              queries={multilineQueries[OverviewQuery.NETWORK_UTILIZATION]}
              humanizeValue={humanizeDecimalBytesPerSec}
              TopConsumerPopovers={networkPopovers}
            />
            <PrometheusUtilizationItem
              title={t('public~Pod count')}
              utilizationQuery={utilizationQueries[OverviewQuery.POD_UTILIZATION].utilization}
              TopConsumerPopover={PodPopover}
              humanizeValue={humanizeNumber}
            />
            {dynamicItemExtensions.map(({ uid, properties }) => (
              <PrometheusUtilizationItem
                key={uid}
                title={properties.title}
                utilizationQuery={properties.getUtilizationQuery(selectedNodes)}
                totalQuery={properties.getTotalQuery?.(selectedNodes)}
                humanizeValue={properties.humanize}
                TopConsumerPopover={properties.TopConsumerPopover}
                requestQuery={properties.getRequestQuery?.(selectedNodes)}
                limitQuery={properties.getLimitQuery?.(selectedNodes)}
              />
            ))}
            {dynamicMultilineItemExtensions.map(({ uid, properties }) => (
              <PrometheusMultilineUtilizationItem
                key={uid}
                title={properties.title}
                queries={properties.getUtilizationQueries(selectedNodes)}
                humanizeValue={properties.humanize}
                TopConsumerPopovers={properties.TopConsumerPopovers}
              />
            ))}
          </ClusterUtilizationContext.Provider>
        </UtilizationBody>
      </Card>
    )
  );
};

type PrometheusCommonProps = {
  title: string;
  humanizeValue: Humanize;
  byteDataType?: ByteDataTypes;
  namespace?: string;
  isDisabled?: boolean;
};

type PrometheusUtilizationItemProps = PrometheusCommonProps & {
  utilizationQuery: string;
  totalQuery?: string;
  limitQuery?: string;
  requestQuery?: string;
  TopConsumerPopover?: ComponentType<TopConsumerPopoverProps>;
  setLimitReqState?: (state: LimitRequested) => void;
};

type PrometheusMultilineUtilizationItemProps = PrometheusCommonProps & {
  queries: QueryWithDescription[];
  TopConsumerPopovers?: ComponentType<TopConsumerPopoverProps>[];
};

type UtilizationCardNodeFilterProps = {
  machineConfigPools: MachineConfigPoolKind[];
  onNodeSelect: (event: MouseEvent, selection: string) => void;
  selectedNodes: string[];
};
