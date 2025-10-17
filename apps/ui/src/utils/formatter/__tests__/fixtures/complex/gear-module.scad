// 2D gear profile module
module gear_2d(teeth,pitch_r,depth){
angle_step=360/teeth;

union(){
for(i=[0:teeth-1]){
rotate([0,0,i*angle_step]){
tooth_profile(pitch_r,depth,angle_step);
}
}
}
}