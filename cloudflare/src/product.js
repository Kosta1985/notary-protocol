const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};

export async function handleProduct(request,env,url=new URL(request.url)){
  if(!url.pathname.startsWith('/api/v1/product/'))return null;
  if(request.method==='GET'&&url.pathname==='/api/v1/product/plans'){
    return reply({
      service:'AccordTrace Product Plans',
      version:'0.1.0',
      currency:'AUD',
      pricing_status:'commercial_packaging_not_checkout',
      plans:[
        {
          id:'community',
          audience:'developers and open-source agents',
          price:{monthly:null,label:'Free / protocol access'},
          capabilities:['receipts','passport','public evidence APIs','basic gateway decisions','SDKs'],
          limits:{control_plane:false,enterprise_alerting:false,custom_integrations:false,sla:false},
          notes:['No numeric public Trust Score.','Payment verification remains non-custodial.']
        },
        {
          id:'business',
          audience:'teams operating production agents',
          price:{monthly:null,label:'Contact / usage-based packaging'},
          capabilities:['community_features','capability_gateway','runtime_enforcement','incident_console','operator_sessions','signed_webhook_alerts','retention_controls','usage_metering'],
          limits:{control_plane:true,enterprise_alerting:true,custom_integrations:'configured',sla:'commercial agreement'},
          notes:['Customer-owned or customer-authorized infrastructure only.','Containment hooks require explicit customer configuration.']
        },
        {
          id:'enterprise',
          audience:'regulated and high-assurance organizations',
          price:{monthly:null,label:'Custom enterprise agreement'},
          capabilities:['business_features','attestor_safety','sybil_graph_signals','enterprise_incident_response','custom_retention','integration_policy','deployment_readiness_controls','audit_receipts'],
          limits:{control_plane:true,enterprise_alerting:true,custom_integrations:'policy-controlled',sla:'custom'},
          notes:['Graph signals are review evidence, not proof of collusion.','No automatic punitive actions from reputation or graph signals.']
        }
      ],
      metering_dimensions:['console_reads','containment_actions','containment_hooks','alert_deliveries','gateway_authorizations','verification_events'],
      commercial_boundary:'This endpoint describes product packaging only. Prices and legal service levels require a separate commercial agreement.',
      security_boundary:'AccordTrace does not custody funds, seize assets, expose customer secrets, or control unrelated third-party infrastructure.'
    });
  }
  return reply({error:'not_found'},404);
}

function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});}
