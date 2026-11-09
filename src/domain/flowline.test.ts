import {describe,it,expect} from 'vitest'
import {scheduleProjects,projectDisplay,listProgress,readBinding,linkKey,flowlineUrl} from './flowline'
import type {FlowState,FlowBinding,FlowStage} from './flowline'
import type {StageProject} from './types'
const stage=(id:string,title:string,tasks:boolean[],extra:Partial<FlowStage>={}):FlowStage=>({id,title,status:'pending',planStart:'',planEnd:'',actualStartedAt:'',actualCompletedAt:'',tasks:tasks.map((done,i)=>({id:id+i,text:title+'事项'+i,done})),...extra})
const binding:FlowBinding={projectId:'source',flowId:'design',mode:'follow'}
const project:StageProject={id:'schedule',name:'排期项目',stageIndex:2,createdAt:'2026-11-01',designStart:'2026-11-01',designEnd:'2026-12-30',taskStart:'2026-11-02',taskEnd:'2026-11-03',note:'保留备注'}
const state=(stages:FlowStage[]):FlowState=>({ready:true,status:'已同步',at:1,cached:false,data:{projects:[{id:'source',name:'流程项目',flows:[{id:'other',name:'主材',stages:[stage('material','无关',[false])]},{id:'design',name:'设计',stages}]}]}})
describe('流程与排期联动',()=>{
 it('only projects the selected list and keeps overall dates and notes',()=>{const view=projectDisplay(project,binding,state([stage('a','方案',[true,true]),stage('b','施工图',[true,false],{planStart:'2026-11-15',planEnd:'2026-11-20'})]));expect(view.flowline).toMatchObject({label:'施工图',next:'施工图事项1',percent:75,nodePercent:50,completed:3,total:4});expect(view.designEnd).toBe(project.designEnd);expect(view.note).toBe(project.note);expect(view.taskStart).toBe('2026-11-15');expect(view.flowline?.url).toContain('stage=b&task=b1')})
 it('does not reuse the previous manual dates when a new phase is unplanned',()=>{const view=projectDisplay(project,binding,state([stage('a','新阶段',[false])]));expect(view.taskStart).toBe('');expect(view.taskEnd).toBe('');expect(view.flowline?.scheduled).toBe(false);expect(project.taskStart).toBe('2026-11-02')})
 it('handles explicit active phases and all completed phases',()=>{const stages=[stage('a','前期',[false]),stage('b','进行中',[false],{status:'active'})];expect(listProgress({id:'design',name:'设计',stages}).current?.id).toBe('b');const view=projectDisplay(project,binding,state([stage('a','完成',[true])]));expect(view.flowline).toMatchObject({label:'已完成',percent:100,allDone:true});expect(view.taskCompleted).toBe(true)})
 it('retains a missing binding without showing stale manual progress',()=>{const view=projectDisplay(project,binding,state([]));expect(view.flowline?.label).toBe('尚未添加节点');const missing=projectDisplay(project,{...binding,flowId:'removed'},state([]));expect(missing.flowline?.percent).toBeNull();expect(missing.taskStart).toBe('');expect(missing.designStart).toBe(project.designStart)})
 it('uses stable IDs after rename and restores manual mode',()=>{const s=state([stage('a','改名后',[false])]);s.data.projects[0].name='新项目名';expect(projectDisplay(project,binding,s).flowline?.label).toBe('改名后');const manual=projectDisplay(project,{...binding,mode:'manual'},s);expect(manual.flowline).toBeUndefined();expect(manual.taskStart).toBe(project.taskStart)})
 it('round-trips bindings as syncable preferences without putting code in links',()=>{const preferences={[linkKey(project.id)]:JSON.stringify(binding)};expect(readBinding(JSON.parse(JSON.stringify(preferences))[linkKey(project.id)])).toEqual(binding);expect(readBinding('broken')).toBeNull();expect(flowlineUrl(binding)).toBe('https://sange0613.github.io/flowline-dashboard/#project=source&flow=design')})
})

it('automatically schedules only design projects with separate project and node dates',()=>{
 const workspace=state([stage('a','方案',[false],{planStart:'2026-11-10',planEnd:'2026-11-15'})])
 const source=workspace.data.projects[0]
 Object.assign(source,{projectStart:'2026-11-01',projectEnd:'2026-12-01'})
 source.flows[1].isDesign=true
 const auto=scheduleProjects([],{},workspace)
 expect(auto).toHaveLength(1)
 expect(auto[0]).toMatchObject({automatic:true,designStart:'2026-11-01',designEnd:'2026-12-01',taskStart:'2026-11-10',taskEnd:'2026-11-15'})
 expect(scheduleProjects([project],{[linkKey(project.id)]:JSON.stringify(binding)},workspace)).toHaveLength(1)
 source.flows.pop()
 expect(scheduleProjects([],{},workspace)).toHaveLength(0)
})
