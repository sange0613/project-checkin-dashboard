import type { StageProject, SyncSettingValue } from './types'
import { hydrateStageProject, stagePercent } from './projectStages'
export type FlowTask={id:string;text:string;done:boolean}
export type FlowStage={id:string;title:string;remark?:string;status:string;planStart:string;planEnd:string;actualStartedAt:string;actualCompletedAt:string;tasks:FlowTask[]}
export type FlowList={isDesign?:boolean;id:string;name:string;stages:FlowStage[]}
export type FlowProject={projectStart?:string;projectEnd?:string;id:string;name:string;flows:FlowList[]}
export type FlowWorkspace={projects:FlowProject[]}
export type FlowBinding={projectId:string;flowId:string;mode:'follow'|'manual'}
export type FlowState={data:FlowWorkspace;ready:boolean;status:string;at:number;cached:boolean}
export type FlowView={available:boolean;listName?:string;stages:FlowStage[];label:string;next:string;percent:number|null;nodePercent:number;completed:number;total:number;labels:string[];doneIndices:number[];index:number;allDone:boolean;scheduled:boolean;stageId:string;taskId:string;url:string;projectName:string;actualStartedAt:string;actualCompletedAt:string;message?:string}
export type StageDisplay=ReturnType<typeof hydrateStageProject>&{flowline?:FlowView;automatic?:boolean}
export const FLOWLINE_URL='https://sange0613.github.io/flowline-dashboard/'
export const linkKey=(id:string)=>'flowline-link:'+id
export function readBinding(value:SyncSettingValue|undefined):FlowBinding|null{try{const v=typeof value==='string'?JSON.parse(value):null;return v&&typeof v.projectId==='string'&&typeof v.flowId==='string'&&(v.mode==='follow'||v.mode==='manual')?v:null}catch{return null}}
export function flowlineUrl(binding:FlowBinding,stageId='',taskId=''){const params=new URLSearchParams({project:binding.projectId,flow:binding.flowId});if(stageId)params.set('stage',stageId);if(taskId)params.set('task',taskId);return FLOWLINE_URL+'#'+params.toString()}
export const flowStageDone=(s:FlowStage)=>s.status==='done'||s.tasks.length>0&&s.tasks.every(t=>t.done)
export function listProgress(list:FlowList){let total=0,completed=0;for(const s of list.stages){total+=Math.max(1,s.tasks.length);completed+=s.status==='done'?Math.max(1,s.tasks.length):s.tasks.filter(t=>t.done).length}const current=list.stages.find(s=>s.status==='active'&&!flowStageDone(s))||list.stages.find(s=>!flowStageDone(s));const index=current?list.stages.indexOf(current):Math.max(0,list.stages.length-1);const task=current?.tasks.find(t=>!t.done),next=task||list.stages.slice(index+1).find(s=>!flowStageDone(s));return {total,completed,percent:total?Math.round(completed/total*100):0,current,index,task,next,allDone:list.stages.length>0&&list.stages.every(flowStageDone)}}
function unnumberedTitle(title:string){
  return title.trim().replace(/^\s*[0-9]+[.、·_\s-]*/, '').replace(/\s/g,'')
}

export function followedChecklist(project:FlowProject|undefined,flowId:string|undefined){
  const design=project?.flows.find(list=>list.id===flowId)
  if(!design?.isDesign)return design
  const finished=design.stages.some(stage=>
    (unnumberedTitle(stage.title)==='服务完结'&&flowStageDone(stage))||
    stage.tasks.some(task=>unnumberedTitle(task.text)==='服务完结'&&task.done)
  )
  if(!finished)return design
  return project?.flows.find(list=>list.id!==design.id&&unnumberedTitle(list.name)==='装修准备事项')||design
}

export function projectDisplay(project:StageProject,binding:FlowBinding|null,state:FlowState):StageDisplay{const base=hydrateStageProject(project);if(!binding||binding.mode==='manual')return base;const source=state.data.projects.find(p=>p.id===binding.projectId),list=followedChecklist(source,binding.flowId);if(!list){return {...base,taskStart:'',taskEnd:'',taskCompleted:false,flowline:{available:false,stages:[],label:state.ready?'未找到关联清单':'等待流程同步',next:'',percent:null,nodePercent:0,completed:0,total:0,labels:[],doneIndices:[],index:0,allDone:false,scheduled:false,stageId:'',taskId:'',url:flowlineUrl(binding),projectName:source?.name||'',actualStartedAt:'',actualCompletedAt:'',message:state.ready?'关联项目或清单已移除，或尚未同步；原排期仍保留。':state.status}}}const info=listProgress(list),s=info.current||list.stages.at(-1),scheduled=Boolean(s?.planStart&&s?.planEnd&&/^\d{4}-\d{2}-\d{2}$/.test(s.planStart)&&/^\d{4}-\d{2}-\d{2}$/.test(s.planEnd)&&Number.isFinite(Date.parse(s.planStart))&&Number.isFinite(Date.parse(s.planEnd))&&s.planStart<=s.planEnd);return {...base,taskStart:scheduled?s!.planStart:'',taskEnd:scheduled?s!.planEnd:'',taskCompleted:info.allDone,flowline:{available:true,listName:list.name,stages:list.stages,label:info.allDone?'已完成':s?.title||'尚未添加节点',next:info.task?.text||((info.next&&'title'in info.next)?info.next.title:''),percent:info.percent,nodePercent:s?(flowStageDone(s)?100:Math.round(s.tasks.filter(t=>t.done).length/Math.max(1,s.tasks.length)*100)):0,completed:info.completed,total:info.total,labels:list.stages.map(s=>s.title),doneIndices:list.stages.flatMap((s,i)=>flowStageDone(s)?[i]:[]),index:info.index,allDone:info.allDone,scheduled,stageId:s?.id||'',taskId:info.task?.id||'',url:flowlineUrl({...binding,flowId:list.id},s?.id,info.task?.id),projectName:source!.name,actualStartedAt:s?.actualStartedAt||'',actualCompletedAt:s?.actualCompletedAt||''}}}
export const displayPercent=(p:StageDisplay)=>p.flowline?p.flowline.percent:stagePercent(p.stageIndex)
export const displayLabel=(p:StageDisplay,labels:string[])=>p.flowline?.label||labels[p.stageIndex]||'未设置阶段'

export function scheduleProjects(saved:StageProject[],preferences:Record<string,SyncSettingValue>,state:FlowState):StageDisplay[]{
  const shown=new Set<string>()
  const rows:StageDisplay[]=[]
  for(const project of saved){
    const binding=readBinding(preferences[linkKey(project.id)])
    const source=state.data.projects.find(p=>p.id===binding?.projectId)
    const flow=source?.flows.find(f=>f.id===binding?.flowId)
    if(binding?.mode==='follow' && state.ready && (flow?.isDesign===false || !flow))continue
    const row=projectDisplay(project,binding,state)
    if(binding?.mode==='follow'&&flow?.isDesign&&source){
      if(shown.has(source.id))continue
      shown.add(source.id)
      row.name=source.name
      if(source.projectStart&&source.projectEnd){row.designStart=source.projectStart;row.designEnd=source.projectEnd}
    }
    rows.push(row)
  }
  for(const source of state.data.projects){
    const flow=source.flows.find(f=>f.isDesign)
    if(!flow||shown.has(source.id))continue
    const project:StageProject={id:'flowline:'+source.id,name:source.name,stageIndex:0,createdAt:source.projectStart||'',
      designStart:source.projectStart,designEnd:source.projectEnd}
    const row=projectDisplay(project,{mode:'follow',projectId:source.id,flowId:flow.id},state)
    row.designStart=source.projectStart||''
    row.designEnd=source.projectEnd||''
    row.automatic=true
    rows.push(row)
  }
  return rows
}
